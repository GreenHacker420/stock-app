import { View } from "react-native";
import { Button, Dialog, Icon, Portal, Text } from "react-native-paper";
import { colors } from "../../theme";

type SuccessModalProps = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
};

export function SuccessModal({ visible, title, message, onClose }: SuccessModalProps) {
  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onClose}
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 28,
          padding: 20,
          alignItems: "center",
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.1,
          shadowRadius: 24,
          elevation: 6,
        }}
      >
        <View style={{ alignItems: "center", gap: 20, marginTop: 8 }}>
          {/* Success Checkmark Circle */}
          <View 
            style={{
              height: 64,
              width: 64,
              borderRadius: 32,
              backgroundColor: "#ecfdf5", // bg-emerald-50
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "#d1fae5", // border-emerald-100
              shadowColor: "#10b981",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 16,
              elevation: 4,
            }}
          >
            <Icon source="check-circle" size={36} color="#10b981" />
          </View>

          <View style={{ alignItems: "center", gap: 8 }}>
            <Text variant="titleLarge" style={{ fontWeight: "900", color: "#0f172a", textAlign: "center" }}>
              {title}
            </Text>
            <Text variant="bodyMedium" style={{ color: "#64748b", textAlign: "center", lineHeight: 20, fontWeight: "500" }}>
              {message}
            </Text>
          </View>

          <Button 
            mode="contained" 
            onPress={onClose} 
            style={{ borderRadius: 14, backgroundColor: colors.primary, width: 180, marginTop: 10 }}
            contentStyle={{ height: 48 }}
            labelStyle={{ fontSize: 14, fontWeight: "800", color: "#ffffff" }}
          >
            Great, thanks!
          </Button>
        </View>
      </Dialog>
    </Portal>
  );
}
