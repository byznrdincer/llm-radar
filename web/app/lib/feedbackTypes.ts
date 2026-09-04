export type FormState = "idle" | "sending" | "success" | "error";
export type SearchState = "idle" | "loading" | "success" | "error";

export type ModelOption = {
  id: string;
  name: string;
  slug: string;
  developer: {
    slug: string;
    name: string;
  };
};

export type ModelPickerProps = {
  api: string;
  selected: ModelOption[];
  onChange: (models: ModelOption[]) => void;
  multiple?: boolean;
  placeholder?: string;
  maxSelected?: number;
};
