import { notFound } from "next/navigation";

// Any path that is not a page shows the 404 page inside the language layout.
export default function CatchAll() {
  notFound();
}

export function generateStaticParams() {
  return [{ rest: ["404"] }];
}
