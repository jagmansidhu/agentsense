import { useState, type FormEvent } from "react";
import type { AgentDefinition } from "../../types";
import { Button } from "../ui/button";
import { Input, Textarea } from "../ui/input";

export interface AgentFormSubmit {
  name: string;
  description: string;
  system_prompt: string;
  task: string;
  model?: string | null;
  temperature?: number | null;
}

interface Props {
  initial?: AgentDefinition;
  submitLabel: string;
  onSubmit: (payload: AgentFormSubmit) => Promise<void> | void;
  onCancel?: () => void;
}

export function AgentForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "");
  const [task, setTask] = useState(initial?.task ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [temperature, setTemperature] = useState<string>(
    initial?.temperature !== null && initial?.temperature !== undefined
      ? String(initial.temperature)
      : "",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const tempNumber = temperature.trim() === "" ? null : Number(temperature);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
        task: task.trim(),
        model: model.trim() ? model.trim() : null,
        temperature:
          tempNumber === null || Number.isNaN(tempNumber) ? null : tempNumber,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-[4px] border border-[rgba(0,161,224,0.25)] bg-[rgba(0,161,224,0.04)] p-3"
    >
      <Field label="Name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Support Bot"
          required
        />
      </Field>
      <Field label="Description (optional)">
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Empathetic SaaS support agent"
        />
      </Field>
      <Field label="System prompt">
        <Textarea
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          placeholder="You are a helpful assistant…"
          rows={4}
        />
      </Field>
      <Field label="Assigned task">
        <Textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Resolve a billing complaint about a duplicate charge."
          rows={3}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Model override (optional)">
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="DeepSeek V3"
          />
        </Field>
        <Field label="Temperature (optional)">
          <Input
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            placeholder="0.7"
            inputMode="decimal"
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="sm" disabled={submitting || !name.trim()}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[rgba(51,51,51,0.6)]">
      <span>{label}</span>
      {children}
    </label>
  );
}
