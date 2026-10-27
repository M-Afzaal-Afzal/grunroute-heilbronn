import type { InputHTMLAttributes } from "react";

// shadcn style Input, hand built on a native input for reliable mobile keyboards.
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`gr-input ${props.className || ""}`.trim()} />;
}
