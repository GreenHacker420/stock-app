import { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Modal as RNModal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
} from "react-native";
import { Text, TextInput, HelperText } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TaxonomyEntity, TaxonomyCopy, EditorSession } from "./taxonomy.types";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../forms/FormTextField";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import {
  normalizeTaxonomyName,
  getTaxonomyComparisonKey,
  getApiErrorMessage,
} from "./taxonomy.utils";

interface TaxonomyEditorSheetProps<T extends TaxonomyEntity> {
  session: EditorSession<T> | null;
  copy: TaxonomyCopy;
  existingItems: readonly T[];
  onClose: () => void;
  onSave: (name: string, session: EditorSession<T>) => Promise<void>;
}

export function TaxonomyEditorSheet<T extends TaxonomyEntity>({
  session,
  copy,
  existingItems,
  onClose,
  onSave,
}: TaxonomyEditorSheetProps<T>) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<any>(null);

  const visible = session !== null;

  // Sync / Reset on session change
  useEffect(() => {
    if (session) {
      setName(session.entity?.name ?? "");
      setError(null);
      setIsPending(false);
    } else {
      setName("");
      setError(null);
      setIsPending(false);
    }
  }, [session]);

  const cleanInput = normalizeTaxonomyName(name);
  const isUnchanged =
    session?.mode === "edit" &&
    session.entity &&
    cleanInput === session.entity.name;

  const handleDismiss = () => {
    if (isPending) return;
    Keyboard.dismiss();
    onClose();
  };

  const checkDuplicate = (val: string) => {
    const key = getTaxonomyComparisonKey(val);
    if (!key) return false;
    return existingItems.some(
      (item) =>
        getTaxonomyComparisonKey(item.name) === key &&
        item.id !== session?.entity?.id
    );
  };

  const handleSubmit = async () => {
    if (!session || isPending) return;

    const trimmed = cleanInput;
    if (!trimmed) {
      setError(`${copy.singular} name cannot be empty.`);
      return;
    }

    if (trimmed.length > 50) {
      setError(`${copy.singular} name is too long (max 50 characters).`);
      return;
    }

    if (isUnchanged) {
      handleDismiss();
      return;
    }

    if (checkDuplicate(trimmed)) {
      setError(`A ${copy.singular.toLowerCase()} with this name already exists.`);
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      await onSave(trimmed, session);
    } catch (err: any) {
      const fallback =
        session.mode === "create" ? copy.createErrorFallback : copy.updateErrorFallback;
      setError(getApiErrorMessage(err, fallback));
      setIsPending(false);
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Backdrop */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          style={styles.backdrop}
          onPress={handleDismiss}
          disabled={isPending}
        />

        {/* Sheet Content */}
        {session && (
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
            <View style={styles.handle} />

            <Text style={styles.title}>
              {session.mode === "create" ? `Add ${copy.singular}` : `Edit ${copy.singular}`}
            </Text>

            <View style={styles.formContainer}>
              <FormTextField
                ref={inputRef}
                label={`${copy.singular} name`}
                value={name}
                onChangeText={(val) => {
                  setName(val);
                  if (error) setError(null);
                }}
                disabled={isPending}
                error={!!error}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                autoFocus
                maxLength={50}
              />

              {error && <HelperText type="error" visible={!!error} style={styles.helperText}>{error}</HelperText>}

              <View style={styles.actions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={handleDismiss}
                  disabled={isPending}
                  style={styles.flex1}
                />
                <Button
                  label="Save"
                  onPress={handleSubmit}
                  loading={isPending}
                  disabled={isPending || !cleanInput || isUnchanged}
                  style={styles.flex1}
                />
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    maxHeight: "80%",
    flexShrink: 1,
    ...shadow.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  formContainer: {
    gap: spacing.md,
    width: "100%",
  },
  helperText: {
    paddingHorizontal: 0,
    marginTop: -spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  flex1: {
    flex: 1,
  },
});
