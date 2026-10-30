"use client";

import React from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default" | "warning";
  loading?: boolean;
}

export function AlertModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  loading = false,
}: AlertModalProps) {
  const icon =
    variant === "destructive" ? (
      <AlertTriangle className="w-5 h-5 text-rose-400" />
    ) : variant === "warning" ? (
      <AlertTriangle className="w-5 h-5 text-amber-400" />
    ) : (
      <Info className="w-5 h-5 text-indigo-400" />
    );

  const confirmVariant =
    variant === "destructive" ? "destructive" : variant === "warning" ? "amber" : "default";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      size="sm"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-xs text-slate-300 leading-relaxed">{description}</p>
    </Modal>
  );
}
