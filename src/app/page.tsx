"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Header } from "@/components/Header";
import { WorkflowCanvas } from "@/components/WorkflowCanvas";
import { FloatingActionBar } from "@/components/FloatingActionBar";
import { AnnotationModal } from "@/components/AnnotationModal";
import { ScenarioMode } from "@/components/scenario/ScenarioMode";
import { useWorkflowStore } from "@/store/workflowStore";

export default function Home() {
  const initializeAutoSave = useWorkflowStore(
    (state) => state.initializeAutoSave
  );
  const cleanupAutoSave = useWorkflowStore((state) => state.cleanupAutoSave);
  const appMode = useWorkflowStore((state) => state.appMode);
  const setAppMode = useWorkflowStore((state) => state.setAppMode);
  const setShowQuickstart = useWorkflowStore((state) => state.setShowQuickstart);

  // Restore persisted app mode on client (avoids hydration mismatch)
  useEffect(() => {
    const persisted = localStorage.getItem("node-banana-app-mode") as "workflow" | "scenario" | null;
    if (persisted && persisted !== appMode) {
      setAppMode(persisted);
    }
  }, []);

  useEffect(() => {
    initializeAutoSave();
    return () => cleanupAutoSave();
  }, [initializeAutoSave, cleanupAutoSave]);

  if (appMode === "scenario") {
    return (
      <ScenarioMode
        onBack={() => {
          setAppMode("workflow");
          setShowQuickstart(true);
        }}
      />
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col">
        <Header />
        <WorkflowCanvas />
        <FloatingActionBar />
        <AnnotationModal />
      </div>
    </ReactFlowProvider>
  );
}
