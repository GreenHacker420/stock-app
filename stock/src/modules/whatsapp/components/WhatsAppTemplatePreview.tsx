import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { WaTemplateDefinition } from "../../../api/whatsapp.api";
import { waColors } from "../whatsapp-ui";

type Props = {
  definition: Partial<WaTemplateDefinition>;
};

function replaceSamples(text: string, definition: Partial<WaTemplateDefinition>, component: "HEADER" | "BODY") {
  let output = text;
  const mappings = (definition.mappings || [])
    .filter((mapping) => mapping.component === component)
    .sort((a, b) => a.position - b.position);
  mappings.forEach((mapping) => {
    output = output.replace(`{{${mapping.position}}}`, mapping.sampleValue || mapping.fallbackValue || `{{${mapping.position}}}`);
  });
  return output;
}

function replaceCardSamples(text: string, definition: Partial<WaTemplateDefinition>, cardIndex: number, buttonIndex?: number) {
  let output = text;
  const mappings = (definition.mappings || [])
    .filter((mapping) => (
      mapping.component === "CARD"
      && mapping.cardIndex === cardIndex
      && mapping.buttonIndex === buttonIndex
    ))
    .sort((a, b) => a.position - b.position);
  mappings.forEach((mapping) => {
    output = output.replace(`{{${mapping.position}}}`, mapping.sampleValue || mapping.fallbackValue || `{{${mapping.position}}}`);
  });
  return output;
}

export function WhatsAppTemplatePreview({ definition }: Props) {
  const header = definition.header;
  const body = definition.body?.text || "Message body";
  const buttons = definition.buttons || [];

  return (
    <View style={styles.wallpaper}>
      <View style={styles.bubble}>
        {header?.format === "TEXT" && !!header.text && (
          <Text style={styles.header}>{replaceSamples(header.text, definition, "HEADER")}</Text>
        )}
        {header && header.format !== "NONE" && header.format !== "TEXT" && (
          <View style={styles.mediaHeader}>
            <MaterialCommunityIcons
              name={({
                IMAGE: "image-outline",
                VIDEO: "video-outline",
                DOCUMENT: "file-document-outline",
                LOCATION: "map-marker-outline",
              } as const)[header.format] as any}
              size={34}
              color={waColors.textSecondary}
            />
            <Text style={styles.mediaLabel}>{header.format.toLowerCase()} header</Text>
          </View>
        )}
        <Text style={styles.body}>{replaceSamples(body, definition, "BODY")}</Text>
        {!!definition.footer?.text && <Text style={styles.footer}>{definition.footer.text}</Text>}
        <Text style={styles.time}>12:34</Text>
        {!definition.carousel && buttons.map((button, index) => (
          <View key={`${button.type}-${index}`} style={styles.button}>
            <MaterialCommunityIcons
              name={
                button.type === "PHONE_NUMBER"
                  ? "phone-outline"
                  : button.type === "URL"
                    ? "open-in-new"
                    : button.type === "FLOW"
                      ? "form-select"
                      : button.type === "COPY_CODE"
                        ? "content-copy"
                        : "reply-outline"
              }
              size={16}
              color="#027EB5"
            />
            <Text style={styles.buttonText}>{"text" in button ? button.text : "Copy code"}</Text>
          </View>
        ))}
        {definition.callPermissionRequest && (
          <View style={styles.button}>
            <MaterialCommunityIcons name="phone-check-outline" size={16} color="#027EB5" />
            <Text style={styles.buttonText}>Allow business calls</Text>
          </View>
        )}
      </View>
      {definition.carousel && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
          {definition.carousel.cards.map((card, cardIndex) => (
            <View key={cardIndex} style={styles.carouselCard}>
              <View style={styles.carouselMedia}>
                <MaterialCommunityIcons
                  name={card.header.format === "VIDEO"
                    ? "video-outline"
                    : card.header.format === "PRODUCT"
                      ? "shopping-outline"
                      : "image-outline"}
                  size={32}
                  color={waColors.textSecondary}
                />
                <Text style={styles.mediaLabel}>{card.header.format.toLowerCase()}</Text>
              </View>
              {!!card.body?.text && (
                <Text style={styles.carouselBody}>
                  {replaceCardSamples(card.body.text, definition, cardIndex)}
                </Text>
              )}
              {card.buttons.map((button, buttonIndex) => (
                <View key={buttonIndex} style={styles.carouselButton}>
                  <Text style={styles.buttonText}>
                    {replaceCardSamples(button.text, definition, cardIndex, buttonIndex)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wallpaper: {
    minHeight: 260,
    justifyContent: "center",
    padding: 18,
    backgroundColor: waColors.chatBackground,
    borderRadius: 8,
  },
  bubble: {
    alignSelf: "flex-start",
    width: "88%",
    padding: 8,
    borderRadius: 8,
    backgroundColor: waColors.surface,
  },
  header: { color: waColors.text, fontSize: 15, fontWeight: "700", paddingBottom: 5 },
  body: { color: waColors.text, fontSize: 14, lineHeight: 20 },
  footer: { color: waColors.textSecondary, fontSize: 12, paddingTop: 6 },
  time: { alignSelf: "flex-end", color: waColors.textSecondary, fontSize: 10, paddingTop: 3 },
  mediaHeader: {
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginBottom: 8,
    borderRadius: 7,
    backgroundColor: waColors.surfaceMuted,
  },
  mediaLabel: { color: waColors.textSecondary, fontSize: 12, textTransform: "capitalize" },
  button: {
    height: 40,
    marginHorizontal: -8,
    marginBottom: -8,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: waColors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  buttonText: { color: "#027EB5", fontSize: 14, fontWeight: "600" },
  carousel: { gap: 8, paddingTop: 10, paddingRight: 18 },
  carouselCard: { width: 190, overflow: "hidden", borderRadius: 8, backgroundColor: waColors.surface },
  carouselMedia: { height: 112, alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: waColors.surfaceMuted },
  carouselBody: { minHeight: 44, color: waColors.text, fontSize: 13, lineHeight: 18, padding: 8 },
  carouselButton: { height: 38, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: waColors.border },
});
