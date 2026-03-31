"use client";

import React, { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { cn } from "@/lib/utils";
import { DownloadIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

type WordPreviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  file?: {
    fileName?: string;
    url?: string;
    language?: string;
  } | null;
};

export const WordPreviewDrawer: React.FC<WordPreviewDrawerProps> = ({
  open,
  onClose,
  file,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const name = file?.fileName || "文档预览";

  useEffect(() => {
    if (!open || !file?.url) {
      setFileSize(null);
      return;
    }

    const render = async () => {
      try {
        setLoading(true);
        setError(null);
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        // 从 URL 获取文件
        const response = await fetch(file.url!);
        const blob = await response.blob();
        setFileSize(formatFileSize(blob.size));

        if (containerRef.current) {
          await renderAsync(blob, containerRef.current, undefined, {
            inWrapper: true,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            ignoreFonts: true,
            debug: false,
          });

          // 移除空白页
          const sections = containerRef.current.querySelectorAll(
            ".docx-wrapper > section.docx"
          );
          sections.forEach((section) => {
            if (
              section.textContent?.trim() === "" &&
              section.querySelectorAll("img, svg, canvas").length === 0
            ) {
              section.remove();
            }
          });
        }
      } catch (e) {
        console.error("Word preview failed", e);
        setError("预览失败，请尝试下载后查看");
      } finally {
        setLoading(false);
      }
    };

    render();
  }, [open, file]);

  const handleDownload = async () => {
    if (!file?.url) return;

    const response = await fetch(file.url);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName || "document.docx";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/50 transition-opacity duration-300",
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-[60vw] max-w-[800px] bg-white shadow-xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">
              <svg
                className="h-8 w-8 text-blue-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v5a1 1 0 0 0 1 1h5v10H6z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-sm">{name}</span>
              <span className="text-xs text-muted-foreground">
                Word 文档 {fileSize ? `· ${fileSize}` : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-2"
            >
              <DownloadIcon className="h-4 w-4" />
              下载
            </Button>
            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-muted transition-colors"
            >
              <svg
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-50 h-[calc(100%-80px)] overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 z-10">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <div className="mt-4 text-primary text-sm">正在渲染文档...</div>
            </div>
          )}

          {error ? (
            <div className="flex justify-center mt-20">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="bg-white shadow-lg min-h-[800px] min-w-[600px] mx-auto my-4"
            />
          )}
        </div>
      </div>
    </div>
  );
};
