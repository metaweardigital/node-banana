# Cinematic Continuity Redesign

## Summary

Replace the flat continuity chip toggles with organized collapsible category groups using real cinematography terminology from SKILL.md. Rename "Continuity" to "Cinematic". Auto-append selected options to prompts.

## Layout

Right panel, between Evasion and Parameters:

```
Cinematic  [on/off]

▶ Camera    Static
▶ Lighting  none
▶ Lens      none
▶ Mood      none
▶ Scene     Eye contact
```

- Collapsed groups show one line: `▶ Category    active selection`
- Expanding a group auto-collapses others
- On/off toggle disables all cinematic instructions
- Chips within Camera/Lighting/Lens/Mood are mutually exclusive (radio)
- Scene group is multi-select (options don't conflict)
- Click active chip again to deselect (none)

## Groups & Options

### Camera (single-select)

| Label | Prompt |
|-------|--------|
| Static | `static camera, no camera movement, locked shot` |
| Slow push in | `slow push in toward subject, dolly in, gradual` |
| Pull back | `slow pull back from subject, dolly out, revealing surroundings` |
| Slow pan | `slow smooth pan, gentle horizontal camera movement` |
| Tracking | `tracking shot following the subject, camera moves alongside, steadicam` |
| Orbit | `slow orbit shot circling around the subject, arc movement` |
| Crane | `crane shot, sweeping vertical camera movement, boom` |
| Handheld | `handheld camera, slight natural camera shake, raw documentary feel` |
| Steadicam | `steadicam shot, smooth gliding movement, elegant tracking` |

### Lighting (single-select)

| Label | Prompt |
|-------|--------|
| Golden hour | `golden hour warm sunset lighting, magic hour, rim light` |
| Rim light | `rim lighting, edge light, glowing backlit outline, subject separation` |
| Soft diffused | `soft diffused light, gentle even lighting, flattering` |
| Low key | `low key dramatic lighting, deep shadows, high contrast, moody` |
| High key | `high key bright even lighting, minimal shadows, clean` |
| Neon | `neon lighting, neon glow, colorful urban night light` |
| Volumetric | `volumetric lighting, god rays, light rays through atmosphere` |
| Natural | `natural available light, realistic motivated lighting` |
| Candlelight | `candlelight, warm flickering intimate light` |

### Lens (single-select)

| Label | Prompt |
|-------|--------|
| Shallow DoF | `shallow depth of field, beautiful bokeh, blurred background, subject isolation` |
| Deep focus | `deep focus, everything in focus, sharp throughout` |
| 85mm portrait | `shot on 85mm lens, portrait telephoto compression, flattering` |
| 35mm wide | `shot on 35mm wide angle lens, natural cinematic perspective` |
| Anamorphic | `anamorphic widescreen, oval bokeh, cinematic lens flare` |
| Tilt-shift | `tilt-shift miniature effect, selective focus plane` |

### Mood (single-select)

| Label | Prompt |
|-------|--------|
| Misty | `misty atmospheric haze, soft diffused environment` |
| Foggy | `dense fog, low visibility, mysterious atmosphere` |
| Rainy | `rain, wet surfaces, rain reflections, moody weather` |
| Moody | `moody dark atmosphere, brooding, somber tone` |
| Ethereal | `ethereal dreamlike atmosphere, soft glowing, otherworldly` |
| Gritty | `gritty raw atmosphere, urban texture, harsh reality` |
| Dreamy | `dreamy soft focus atmosphere, romantic haze, gentle` |
| Serene | `serene peaceful calm atmosphere, tranquil, still` |

### Scene (multi-select)

| Label | Prompt |
|-------|--------|
| Smooth motion | `smooth continuous motion, no sudden movements` |
| No cuts | `no scene cuts, no transitions` |
| Consistent light | `maintain exact same brightness, exposure, color temperature, and lighting throughout, no darkening or brightening` |
| Eye contact | `person looking directly at camera, direct eye contact with viewer, facing the camera` |
| Empty scene | `no other people, no bystanders, no pedestrians, no other vehicles, no moving objects in background, empty surroundings, subject is alone in the scene` |

## Prompt Assembly

```
[evasion(user prompt)]. [base continuity], [camera], [lighting], [lens], [mood], [scene1], [scene2]...
```

Base continuity (always when toggle on):
> seamlessly continue this scene from the input frame, maintain consistent style, atmosphere, brightness, and exposure

Only groups with active selections contribute to the prompt.

## Defaults

- Cinematic: ON
- Camera: Static
- Lighting: none
- Lens: none
- Mood: none
- Scene: Smooth motion + Consistent light (both active)

## State

Replace `activeModifiers: Set<string>` with a structured object:

```typescript
interface CinematicState {
  camera: string | null;      // single-select group ID or null
  lighting: string | null;
  lens: string | null;
  mood: string | null;
  scene: Set<string>;         // multi-select
}
```

Persisted in `ScenarioStateDisk` as:
```typescript
cinematic?: {
  camera?: string | null;
  lighting?: string | null;
  lens?: string | null;
  mood?: string | null;
  scene?: string[];
};
```

Backwards compatible — old `activeModifiers` array falls back to defaults on load.

## Files to Modify

1. `src/components/scenario/ScenarioMode.tsx` — all changes:
   - Replace `CONTINUITY_MODIFIERS` with `CINEMATIC_GROUPS` constant
   - Replace `activeModifiers: Set<string>` state with `CinematicState`
   - Update `buildFullPrompt` to assemble from cinematic state
   - Update save/load/reset to handle new state shape
   - Replace continuity UI section with collapsible groups
   - Rename "Continuity" to "Cinematic" in UI
