
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "react-native-paper";

import type { WaMessage } from "../../../api/whatsapp.api";
import { colors } from "../../../theme";
import { waColors } from "../whatsapp-ui";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type Props = {
  visible: boolean;
  message: WaMessage | null;
  anchor: { x: number; y: number };
  busy?: boolean;
  onDismiss: () => void;
  onReaction: (emoji: string) => void;
  onMoreReactions: () => void;
  onReply?: () => void;
  onCopy?: () => void;
  onRecall?: () => void;
};

export function MessageReactionOverlay({
  visible,
  message,
  anchor,
  busy = false,
  onDismiss,
  onReaction,
  onMoreReactions,
  onReply,
  onCopy,
  onRecall,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trayWidth = Math.min(width - 24, 344);
  const trayLeft = Math.max(12, Math.min(anchor.x - trayWidth / 2, width - trayWidth - 12));
  const trayTop = Math.max(
    insets.top + 10,
    Math.min(anchor.y - 76, height - insets.bottom - 224),
  );
  const menuWidth = 216;
  const menuLeft = message?.direction === "OUTBOUND"
    ? width - menuWidth - 12
    : 12;
  const myReaction = message?.payload?.reactions?.find((reaction) => reaction.from === "me")?.emoji;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Animated.View
          entering={FadeIn.duration(110)}
          exiting={FadeOut.duration(90)}
          style={styles.backdrop}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close message actions"
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
          />
        </Animated.View>

        <Animated.View
          entering={ZoomIn.duration(150)}
          exiting={ZoomOut.duration(100)}
          style={[
            styles.reactionTray,
            { width: trayWidth, left: trayLeft, top: trayTop },
          ]}
        >
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              onPress={() => onReaction(emoji)}
              style={({ pressed }) => [
                styles.reactionButton,
                myReaction === emoji && styles.reactionButtonSelected,
                pressed && styles.reactionButtonPressed,
              ]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="More reactions"
            onPress={onMoreReactions}
            style={({ pressed }) => [
              styles.moreReaction,
              pressed && styles.reactionButtonPressed,
            ]}
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.textPrimary} />
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(90)}
          style={[
            styles.actionMenu,
            { width: menuWidth, left: menuLeft, top: trayTop + 64 },
          ]}
        >
          {onReply && (
            <ActionRow icon="reply" label="Reply" onPress={onReply} disabled={busy} />
          )}
          {onCopy && (
            <ActionRow icon="content-copy" label="Copy" onPress={onCopy} disabled={busy} />
          )}
          {onRecall && (
            <ActionRow
              icon="trash-can-outline"
              label="Delete for everyone"
              onPress={onRecall}
              disabled={busy}
              destructive
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  const color = destructive ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.actionRowPressed,
      ]}
    >
      <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  reactionTray: {
    position: "absolute",
    height: 54,
    paddingHorizontal: 6,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    boxShadow: "0 5px 18px rgba(15, 23, 42, 0.22)",
  },
  reactionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionButtonSelected: {
    backgroundColor: "#d9fdd3",
  },
  reactionButtonPressed: {
    transform: [{ scale: 1.16 }],
    backgroundColor: "#eef2f1",
  },
  emoji: {
    fontSize: 25,
    lineHeight: 32,
  },
  moreReaction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: waColors.surfaceMuted,
  },
  actionMenu: {
    position: "absolute",
    overflow: "hidden",
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#fff",
    boxShadow: "0 5px 18px rgba(15, 23, 42, 0.2)",
  },
  actionRow: {
    minHeight: 48,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  actionRowPressed: {
    backgroundColor: waColors.surfaceMuted,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
});
