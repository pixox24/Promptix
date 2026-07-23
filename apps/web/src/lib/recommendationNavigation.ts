export function recommendationTemplateTarget(
  templateId: string,
  requestId: string | null,
) {
  const base = `/template/${encodeURIComponent(templateId)}`;
  return requestId
    ? `${base}?recRequest=${encodeURIComponent(requestId)}`
    : base;
}
