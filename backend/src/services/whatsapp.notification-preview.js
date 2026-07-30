const MAX_PREVIEW_LENGTH = 140;

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value) {
  const text = cleanText(value);
  if (text.length <= MAX_PREVIEW_LENGTH) return text;
  return `${text.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function payloadLabel(payload) {
  if (!payload || typeof payload !== "object") return "";
  return cleanText(
    payload.title
      || payload.name
      || payload.body
      || payload.description
      || payload.button_reply?.title
      || payload.list_reply?.title,
  );
}

export function buildWhatsAppNotification({ event, conversation }) {
  const sender = truncate(
    conversation?.contactName
      || event?.contactName
      || conversation?.phone
      || event?.from
      || "WhatsApp customer",
  );
  const caption = truncate(event?.content);
  const detail = payloadLabel(event?.payload);

  let preview;
  switch (event?.type) {
    case "text":
      preview = caption || "New message";
      break;
    case "image":
      preview = caption ? `📷 Photo: ${caption}` : "📷 Photo";
      break;
    case "video":
      preview = caption ? `🎥 Video: ${caption}` : "🎥 Video";
      break;
    case "audio":
      preview = event?.voice ? "🎤 Voice message" : "🎵 Audio";
      break;
    case "document": {
      const documentName = truncate(event?.fileName) || "Document";
      preview = caption ? `📄 ${documentName}: ${caption}` : `📄 ${documentName}`;
      break;
    }
    case "sticker":
      preview = "Sticker";
      break;
    case "location":
      preview = detail ? `📍 Location: ${detail}` : "📍 Location";
      break;
    case "contacts":
      preview = "👤 Contact";
      break;
    case "button":
    case "button_reply":
    case "list_reply":
      preview = detail || "Interactive reply";
      break;
    case "flow_reply":
      preview = "Form response";
      break;
    case "order":
      preview = "🛒 Order";
      break;
    case "system":
      preview = detail || "WhatsApp system message";
      break;
    default:
      preview = caption || detail || "New WhatsApp message";
      break;
  }

  return {
    title: `${sender} · WhatsApp`,
    body: truncate(preview),
  };
}
