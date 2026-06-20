import { StyleSheet, View } from "react-native";
import { Button, IconButton, SegmentedButtons, Switch, Text, TextInput } from "react-native-paper";
import type { WaTemplateDefinition } from "../../../api/whatsapp.api";
import { waColors } from "../whatsapp-ui";

type Carousel = NonNullable<WaTemplateDefinition["carousel"]>;
type CarouselCard = Carousel["cards"][number];
type CarouselButton = CarouselCard["buttons"][number];

type Props = {
  value: Carousel;
  onChange: (value: Carousel) => void;
  onUploadExample?: (cardIndex: number, format: "IMAGE" | "VIDEO") => void;
  uploadingCardIndex?: number | null;
};

function createCard(type: Carousel["type"], format: "IMAGE" | "VIDEO" = "IMAGE"): CarouselCard {
  if (type === "PRODUCT") {
    return {
      header: { format: "PRODUCT" },
      buttons: [{ type: "SPM", text: "View" }],
    };
  }
  return {
    header: { format },
    body: { text: "" },
    buttons: [{ type: "URL", text: "View", url: "https://example.com/{{1}}", example: "product" }],
  };
}

export function createDefaultCarousel(type: Carousel["type"] = "MEDIA"): Carousel {
  return {
    type,
    cards: [createCard(type), createCard(type)],
  };
}

export function TemplateCarouselEditor({
  value,
  onChange,
  onUploadExample,
  uploadingCardIndex,
}: Props) {
  const updateCard = (cardIndex: number, updater: (card: CarouselCard) => CarouselCard) => {
    onChange({
      ...value,
      cards: value.cards.map((card, index) => index === cardIndex ? updater(card) : card),
    });
  };

  const setType = (type: Carousel["type"]) => {
    onChange(createDefaultCarousel(type));
  };

  const setBodiesEnabled = (enabled: boolean) => {
    onChange({
      ...value,
      cards: value.cards.map((card) => ({
        ...card,
        body: enabled ? card.body || { text: "" } : undefined,
      })),
    });
  };

  const addCard = () => {
    if (value.type === "PRODUCT" || value.cards.length >= 10) return;
    onChange({
      ...value,
      cards: [...value.cards, createCard("MEDIA", value.cards[0]?.header.format === "VIDEO" ? "VIDEO" : "IMAGE")],
    });
  };

  return (
    <View style={styles.container}>
      <SegmentedButtons
        value={value.type}
        onValueChange={(type) => setType(type as Carousel["type"])}
        buttons={[
          { value: "MEDIA", label: "Media cards", icon: "image-multiple-outline" },
          { value: "PRODUCT", label: "Product cards", icon: "shopping-outline" },
        ]}
      />

      {value.type === "MEDIA" && (
        <View style={styles.optionRow}>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Card descriptions</Text>
            <Text style={styles.optionHint}>Meta requires the same component structure on every card.</Text>
          </View>
          <Switch value={Boolean(value.cards[0]?.body)} onValueChange={setBodiesEnabled} />
        </View>
      )}

      {value.cards.map((card, cardIndex) => (
        <View key={cardIndex} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardNumber}>
              <Text style={styles.cardNumberText}>{cardIndex + 1}</Text>
            </View>
            <View style={styles.cardTitleBody}>
              <Text style={styles.cardTitle}>
                {value.type === "PRODUCT" ? "Product card" : "Media card"}
              </Text>
              <Text style={styles.cardHint}>
                {value.type === "PRODUCT" ? "Product is selected when sending." : "Upload an example asset for Meta review."}
              </Text>
            </View>
            {value.type === "MEDIA" && value.cards.length > 2 && (
              <IconButton
                icon="delete-outline"
                iconColor={waColors.danger}
                onPress={() => onChange({
                  ...value,
                  cards: value.cards.filter((_, index) => index !== cardIndex),
                })}
              />
            )}
          </View>

          {value.type === "MEDIA" && (
            <>
              <SegmentedButtons
                value={card.header.format}
                onValueChange={(format) => updateCard(cardIndex, (current) => ({
                  ...current,
                  header: { ...current.header, format: format as "IMAGE" | "VIDEO" },
                }))}
                buttons={[
                  { value: "IMAGE", label: "Image", icon: "image-outline" },
                  { value: "VIDEO", label: "Video", icon: "video-outline" },
                ]}
              />
              <TextInput
                mode="outlined"
                label="Meta resumable-upload handle"
                value={card.header.exampleHandle || ""}
                onChangeText={(exampleHandle) => updateCard(cardIndex, (current) => ({
                  ...current,
                  header: { ...current.header, exampleHandle },
                }))}
              />
              <Button
                mode="outlined"
                icon="upload"
                loading={uploadingCardIndex === cardIndex}
                disabled={uploadingCardIndex != null}
                onPress={() => onUploadExample?.(cardIndex, card.header.format as "IMAGE" | "VIDEO")}
              >
                Upload review example
              </Button>
            </>
          )}

          {card.body && (
            <TextInput
              mode="outlined"
              label="Card body"
              multiline
              maxLength={160}
              value={card.body.text}
              onChangeText={(text) => updateCard(cardIndex, (current) => ({
                ...current,
                body: { text },
              }))}
            />
          )}

          <View style={styles.buttonHeading}>
            <Text style={styles.optionTitle}>Buttons</Text>
            {card.buttons.length < 2 && (
              <Button
                compact
                icon="plus"
                onPress={() => updateCard(cardIndex, (current) => ({
                  ...current,
                  buttons: [
                    ...current.buttons,
                    value.type === "PRODUCT"
                      ? { type: "URL", text: "Buy now", url: "https://example.com/{{1}}", example: "product" }
                      : { type: "QUICK_REPLY", text: "Interested" },
                  ],
                }))}
              >
                Button
              </Button>
            )}
          </View>

          {card.buttons.map((button, buttonIndex) => (
            <CarouselButtonEditor
              key={buttonIndex}
              button={button}
              product={value.type === "PRODUCT"}
              onChange={(next) => updateCard(cardIndex, (current) => ({
                ...current,
                buttons: current.buttons.map((item, index) => index === buttonIndex ? next : item),
              }))}
              onDelete={() => updateCard(cardIndex, (current) => ({
                ...current,
                buttons: current.buttons.filter((_, index) => index !== buttonIndex),
              }))}
              canDelete={!productButtonRequired(value.type, card.buttons.length)}
            />
          ))}
        </View>
      ))}

      {value.type === "MEDIA" && (
        <Button mode="outlined" icon="plus" disabled={value.cards.length >= 10} onPress={addCard}>
          Add card ({value.cards.length}/10)
        </Button>
      )}
    </View>
  );
}

function CarouselButtonEditor({
  button,
  product,
  onChange,
  onDelete,
  canDelete,
}: {
  button: CarouselButton;
  product: boolean;
  onChange: (button: CarouselButton) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const setType = (type: CarouselButton["type"]) => {
    if (type === "URL") onChange({ type, text: "View", url: "https://example.com/{{1}}", example: "product" });
    else if (type === "PHONE_NUMBER") onChange({ type, text: "Call", phoneNumber: "" });
    else if (type === "SPM") onChange({ type, text: "View" });
    else onChange({ type: "QUICK_REPLY", text: "Interested" });
  };

  return (
    <View style={styles.buttonEditor}>
      <View style={styles.buttonTypeRow}>
        <SegmentedButtons
          style={styles.flex}
          value={button.type}
          onValueChange={(type) => setType(type as CarouselButton["type"])}
          buttons={product
            ? [
                { value: "SPM", label: "View" },
                { value: "URL", label: "URL" },
              ]
            : [
                { value: "QUICK_REPLY", label: "Reply" },
                { value: "URL", label: "URL" },
                { value: "PHONE_NUMBER", label: "Phone" },
              ]}
        />
        <IconButton icon="close" size={18} disabled={!canDelete} onPress={onDelete} />
      </View>
      <TextInput
        mode="outlined"
        label="Button text"
        value={button.text}
        onChangeText={(text) => onChange({ ...button, text })}
      />
      {button.type === "URL" && (
        <>
          <TextInput
            mode="outlined"
            label="URL"
            value={button.url}
            onChangeText={(url) => onChange({ ...button, url })}
          />
          <TextInput
            mode="outlined"
            label="URL variable example"
            value={button.example || ""}
            onChangeText={(example) => onChange({ ...button, example })}
          />
        </>
      )}
      {button.type === "PHONE_NUMBER" && (
        <TextInput
          mode="outlined"
          label="Phone number"
          keyboardType="phone-pad"
          value={button.phoneNumber}
          onChangeText={(phoneNumber) => onChange({ ...button, phoneNumber })}
        />
      )}
    </View>
  );
}

function productButtonRequired(type: Carousel["type"], buttonCount: number) {
  return type === "PRODUCT" && buttonCount <= 1;
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  optionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12 },
  optionText: { flex: 1 },
  optionTitle: { color: waColors.text, fontSize: 13, fontWeight: "700" },
  optionHint: { color: waColors.textSecondary, fontSize: 11, lineHeight: 16, paddingTop: 2 },
  card: { gap: 10, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: waColors.border, borderRadius: 8 },
  cardHeader: { minHeight: 42, flexDirection: "row", alignItems: "center" },
  cardNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: waColors.greenPale },
  cardNumberText: { color: waColors.greenDark, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cardTitleBody: { flex: 1, minWidth: 0, paddingLeft: 9 },
  cardTitle: { color: waColors.text, fontSize: 14, fontWeight: "700" },
  cardHint: { color: waColors.textSecondary, fontSize: 10, paddingTop: 2 },
  buttonHeading: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  buttonEditor: { gap: 8, paddingTop: 4 },
  buttonTypeRow: { flexDirection: "row", alignItems: "center" },
  flex: { flex: 1 },
});
