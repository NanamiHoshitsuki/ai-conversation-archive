export type ApiType = "western" | "shichusuimei" | "transit" | "combined";
export type Mode = "sandbox" | "apikey";
export type Period = "day" | "month";
export type Gender = "male" | "female";

export interface FormValues {
  mode: Mode;
  apiType: ApiType;
  name: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat: string;
  lon: string;
  timezone: string;
  gender: Gender;
  targetDate: string;
  period: Period;
}

export interface AstroApiRequest {
  name?: string;
  birth_date: string;
  birth_time?: string;
  birth_place?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  gender?: Gender;
  target_date?: string;
  period?: Period;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface ApiSuccessResponse {
  ok: true;
  meta: Record<string, unknown>;
  input: Record<string, unknown>;
  raw_data: Record<string, unknown>;
  interpreted_tags: Record<string, unknown[]>;
  writing_hints: {
    tone: { sharpness: number; warmth: number; mystical: number };
    focus_areas: string[];
    key_concepts?: string[];
  };
  ai_prompt_context: {
    role: string;
    instruction: string;
    caution: string[];
  };
  handoff_yaml: string;
}

export type ApiResponse = ApiSuccessResponse | ApiErrorResponse;
