"""
Render a 3D Gaussian splat .ply file to a PNG image.
Fallback renderer for systems without CUDA (e.g. Apple Silicon).

Renders actual Gaussian blobs (not just points) using scale data
from the .ply for dense, recognizable output.

Usage: python render_ply.py <input.ply> <output.png> [width] [height] [angle_deg]
"""

import sys
import numpy as np
from plyfile import PlyData
from PIL import Image


def render_splat(
    ply_path: str,
    output_path: str,
    width: int = 1024,
    height: int = 768,
    angle_deg: float = 0.0,
):
    ply = PlyData.read(ply_path)
    v = ply["vertex"]

    pts = np.column_stack([v["x"], v["y"], v["z"]]).astype(np.float32)

    # SH DC coefficients to RGB
    C0 = 0.28209479177387814
    colors = np.column_stack([
        np.clip(0.5 + C0 * v["f_dc_0"], 0, 1),
        np.clip(0.5 + C0 * v["f_dc_1"], 0, 1),
        np.clip(0.5 + C0 * v["f_dc_2"], 0, 1),
    ]).astype(np.float32)

    opacity = 1.0 / (1.0 + np.exp(-v["opacity"].astype(np.float32)))

    # Gaussian scales (log-space in .ply → exp to get actual scale)
    scale_0 = np.exp(v["scale_0"].astype(np.float32))
    scale_1 = np.exp(v["scale_1"].astype(np.float32))
    scale_2 = np.exp(v["scale_2"].astype(np.float32))
    # Use the average of the two largest scales as the splat radius
    scales = np.sort(np.column_stack([scale_0, scale_1, scale_2]), axis=1)
    splat_radius = (scales[:, 1] + scales[:, 2]) / 2.0  # avg of 2 largest

    # Filter low opacity
    mask = opacity > 0.02
    pts, colors, opacity = pts[mask], colors[mask], opacity[mask]
    splat_radius = splat_radius[mask]

    # Rotate around Y axis
    if angle_deg != 0.0:
        rad = np.radians(angle_deg)
        cos_a, sin_a = np.cos(rad), np.sin(rad)
        center = pts.mean(axis=0)
        pts = pts - center
        x_rot = pts[:, 0] * cos_a + pts[:, 2] * sin_a
        z_rot = -pts[:, 0] * sin_a + pts[:, 2] * cos_a
        pts[:, 0] = x_rot
        pts[:, 2] = z_rot
        pts = pts + center

    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]

    # Scene bounds (wide percentiles to capture everything)
    x_min, x_max = np.percentile(x, 0.5), np.percentile(x, 99.5)
    y_min, y_max = np.percentile(y, 0.5), np.percentile(y, 99.5)

    # Padding
    x_pad = (x_max - x_min) * 0.1
    y_pad = (y_max - y_min) * 0.1
    x_min -= x_pad
    x_max += x_pad
    y_min -= y_pad
    y_max += y_pad

    # Preserve aspect ratio
    scene_w = x_max - x_min
    scene_h = y_max - y_min
    scene_aspect = scene_w / (scene_h + 1e-8)
    image_aspect = width / height

    if scene_aspect > image_aspect:
        new_h = scene_w / image_aspect
        extra = (new_h - scene_h) / 2
        y_min -= extra
        y_max += extra
    else:
        new_w = scene_h * image_aspect
        extra = (new_w - scene_w) / 2
        x_min -= extra
        x_max += extra

    # Compute pixel scale factor (world units to pixels)
    px_per_unit = (width - 1) / (x_max - x_min + 1e-8)

    # Convert splat radius to pixel radius (clamp 1-12 pixels)
    pixel_radii = np.clip(splat_radius * px_per_unit, 1, 12).astype(np.int32)

    # Normalize to pixel coords
    px = ((x - x_min) / (x_max - x_min + 1e-8) * (width - 1)).astype(np.int32)
    py = ((y - y_min) / (y_max - y_min + 1e-8) * (height - 1)).astype(np.int32)

    # Clip to bounds (with margin for splat radius)
    max_r = 12
    valid = (px >= -max_r) & (px < width + max_r) & (py >= -max_r) & (py < height + max_r)
    px, py, z = px[valid], py[valid], z[valid]
    colors, opacity = colors[valid], opacity[valid]
    pixel_radii = pixel_radii[valid]

    # Sort front-to-back
    order = np.argsort(z)
    px, py = px[order], py[order]
    colors, opacity = colors[order], opacity[order]
    pixel_radii = pixel_radii[order]

    # Render with Gaussian blobs
    img = np.zeros((height, width, 3), dtype=np.float32)
    alpha_buf = np.zeros((height, width), dtype=np.float32)

    n = len(px)
    print(f"Rendering {n} splats at {width}x{height}, angle={angle_deg}...")

    for i in range(n):
        cx, cy = px[i], py[i]
        r = pixel_radii[i]
        a = opacity[i]
        c = colors[i]

        # Bounding box for this splat
        y0 = max(0, cy - r)
        y1 = min(height, cy + r + 1)
        x0 = max(0, cx - r)
        x1 = min(width, cx + r + 1)

        if y0 >= y1 or x0 >= x1:
            continue

        # Check if the center pixel is already fully opaque
        if 0 <= cy < height and 0 <= cx < width and alpha_buf[cy, cx] > 0.95:
            continue

        # Generate distance grid for Gaussian falloff
        yy = np.arange(y0, y1) - cy
        xx = np.arange(x0, x1) - cx
        dx, dy = np.meshgrid(xx, yy)
        dist_sq = dx * dx + dy * dy
        sigma = r / 2.0 + 0.5  # Gaussian sigma
        gauss = np.exp(-dist_sq / (2.0 * sigma * sigma))

        # Alpha contribution
        contrib = a * gauss
        remaining = 1.0 - alpha_buf[y0:y1, x0:x1]
        effective = contrib * remaining

        # Only update where there's remaining alpha budget
        update_mask = effective > 0.001
        if not update_mask.any():
            continue

        # Update color and alpha
        for ch in range(3):
            img[y0:y1, x0:x1, ch] += c[ch] * effective * update_mask

        alpha_buf[y0:y1, x0:x1] += effective * update_mask

    img = (np.clip(img, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(img).save(output_path, quality=95)
    print(f"Done: {output_path} ({width}x{height}), angle={angle_deg}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python render_ply.py <input.ply> <output.png> [width] [height] [angle_deg]")
        sys.exit(1)

    ply_path = sys.argv[1]
    output_path = sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 768
    angle = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0

    render_splat(ply_path, output_path, w, h, angle)
