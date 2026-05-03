"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ImportAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportAgentDialog({
  open,
  onOpenChange,
}: ImportAgentDialogProps) {
  const [importMethod, setImportMethod] = useState<"file" | "paste">("file");
  const [jsonData, setJsonData] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);

      // Read file content
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setJsonData(content);
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!jsonData.trim()) {
      toast.error("Please provide agent configuration data");
      return;
    }

    let parsedData;
    try {
      parsedData = JSON.parse(jsonData);
    } catch (_error) {
      toast.error("Invalid JSON format");
      return;
    }

    setIsImporting(true);
    const toastId = toast.loading("Importing agent...");

    try {
      const response = await fetch("/api/agents/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import agent");
      }

      const result = await response.json();

      toast.success("Agent imported successfully", { id: toastId });

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach((warning: { message: string }) => {
          toast.warning(warning.message);
        });
      }

      // Reset and close
      setJsonData("");
      setFile(null);
      onOpenChange(false);

      // Refresh the page to show the new agent
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import agent",
        { id: toastId },
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Agent</DialogTitle>
          <DialogDescription>
            Import an agent configuration from a JSON file or paste the JSON
            directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={importMethod === "file" ? "default" : "outline"}
              onClick={() => setImportMethod("file")}
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
            <Button
              type="button"
              variant={importMethod === "paste" ? "default" : "outline"}
              onClick={() => setImportMethod("paste")}
              size="sm"
            >
              Paste JSON
            </Button>
          </div>

          {importMethod === "file" ? (
            <div className="space-y-2">
              <Label htmlFor="agent-file">Agent Configuration File</Label>
              <Input
                id="agent-file"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  Selected: {file.name}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="agent-json">Agent Configuration JSON</Label>
              <Textarea
                id="agent-json"
                placeholder='{"name": "My Agent", "agentType": "agent", "scope": "org", ...}'
                value={jsonData}
                onChange={(e) => setJsonData(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
