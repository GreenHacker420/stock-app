import { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Image,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";

import { ItemCategory, CreateItemPayload, UpdateItemPayload, LocalItemImage, uploadItemImage } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { requireActiveShopId } from "../../../hooks/useActiveShop";
import { useCategoriesQuery, useCreateItemMutation, useUpdateItemMutation } from "../../../hooks/useItems";
import { Screen } from "../../../components/Screen";
import { AppHeader } from "../../../components/ui/AppHeader";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { AppKeyboardAvoidingView } from "../../../components/ui/AppKeyboardAvoidingView";
import { CategoryPickerSheet } from "../../../components/items/CategoryPickerSheet";
import { colors, spacing, radius, fontSize, fontWeight } from "../../../theme";
import { navigate, goBack } from "../../navigation-ref";
import { AddEditItemRouteParams } from "../../../types/items";
import { parseAmount, parseQty } from "../../../utils/items/validation";

type FormState = {
  name: string;
  sku: string;
  unit: string;
  defaultSellingPrice: string;
  minimumAllowedPrice: string;
  mrp: string;
  purchasePrice: string;
  minimumStock: string;
  categoryId: string;
  initialStock: string;
};

export function AddEditItem() {
  const route = useRoute();
  const existingItem = (route.params as AddEditItemRouteParams | undefined)?.item;

  const categoriesQuery = useCategoriesQuery();
  const categories: ItemCategory[] = categoriesQuery.data ?? [];

  const createMutation = useCreateItemMutation();
  const updateMutation = useUpdateItemMutation();
  const { activeShopId } = useShopStore();
  const token = useAuthStore((s) => s.token);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [form, setForm] = useState<FormState>({
    name: existingItem?.name ?? "",
    sku: existingItem?.sku ?? "",
    unit: existingItem?.unit ?? "pcs",
    defaultSellingPrice: existingItem?.defaultSellingPrice?.toString() ?? "",
    minimumAllowedPrice: existingItem?.minimumAllowedPrice?.toString() ?? "",
    mrp: existingItem?.mrp?.toString() ?? "",
    purchasePrice: existingItem?.purchasePrice?.toString() ?? "",
    minimumStock: existingItem?.minimumStock?.toString() ?? "0",
    categoryId: existingItem?.category?.id ?? "",
    initialStock: "",
  });

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<LocalItemImage | null>(null);
  const [imageUrl, setImageUrl] = useState(existingItem?.imageUrl ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);

  const set = (key: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const selectedCat = categories.find((c) => c.id === form.categoryId);

  if (!activeShopId) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Products" fallbackRoute="ItemList" />
        <EmptyState
          icon="store-alert-outline"
          title="No shop selected"
          subtitle="Please select a shop before managing products."
        />
      </Screen>
    );
  }

  const openSkuScanner = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert("Camera access required", "Allow camera access to scan product barcodes.");
        return;
      }
    }
    setScannerVisible(true);
  };

  const pickImage = async (source: "camera" | "library") => {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera access required", "Allow camera access to capture product photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setSelectedImage({
        uri: asset.uri,
        name: asset.fileName || `product-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      });
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access required", "Allow photo access to choose product photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setSelectedImage({
      uri: asset.uri,
      name: asset.fileName || `product-${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
  };

  const uploadSelectedImage = async () => {
    if (!selectedImage) return imageUrl || null;
    if (!token || !activeShopId) throw new Error("You must be logged in to upload a product photo.");

    setUploadingImage(true);
    try {
      const uploaded = await uploadItemImage(
        token,
        {
          shopId: requireActiveShopId(activeShopId),
          categoryId: form.categoryId || null,
          itemId: existingItem?.id ?? null,
        },
        selectedImage,
      );
      setImageUrl(uploaded.url);
      return uploaded.url;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.unit.trim()) return;

    const mrp = parseAmount(form.mrp, null);
    if (form.mrp.trim() && mrp === null) {
      Alert.alert("Invalid price", "MRP must be a valid non-negative number.");
      return;
    }
    const minimumAllowedPrice = parseAmount(form.minimumAllowedPrice, null);
    if (form.minimumAllowedPrice.trim() && minimumAllowedPrice === null) {
      Alert.alert("Invalid price", "Min allowed price must be a valid non-negative number.");
      return;
    }
    const purchasePrice = parseAmount(form.purchasePrice, null);
    if (form.purchasePrice.trim() && purchasePrice === null) {
      Alert.alert("Invalid price", "Purchase price must be a valid non-negative number.");
      return;
    }
    const defaultSellingPrice = parseAmount(form.defaultSellingPrice, 0);
    if (form.defaultSellingPrice.trim() && defaultSellingPrice === null) {
      Alert.alert("Invalid price", "Selling price must be a valid non-negative number.");
      return;
    }
    const minimumStock = parseQty(form.minimumStock, 0);
    if (form.minimumStock.trim() && minimumStock === null) {
      Alert.alert("Invalid stock", "Low stock alert must be a whole number.");
      return;
    }
    const initialStock = parseQty(form.initialStock, 0);
    if (form.initialStock.trim() && initialStock === null) {
      Alert.alert("Invalid stock", "Initial stock must be a whole number.");
      return;
    }

    const sellingPrice = defaultSellingPrice ?? 0;
    if (mrp !== null && sellingPrice > mrp) {
      Alert.alert("Invalid price", "Selling price cannot be greater than MRP.");
      return;
    }
    if (minimumAllowedPrice !== null && minimumAllowedPrice > sellingPrice) {
      Alert.alert("Invalid price", "Minimum allowed price cannot be greater than selling price.");
      return;
    }

    let uploadedImageUrl: string | null = imageUrl || null;
    try {
      uploadedImageUrl = await uploadSelectedImage();
    } catch (err: any) {
      Alert.alert("Photo Upload Failed", err?.message || "Could not upload product photo.");
      return;
    }

    const basePayload = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      sku: form.sku.trim() || null,
      imageUrl: uploadedImageUrl,
      categoryId: form.categoryId || null,
      defaultSellingPrice: sellingPrice,
      minimumAllowedPrice,
      mrp,
      purchasePrice,
      minimumStock: minimumStock ?? 0,
    };

    if (existingItem) {
      updateMutation.mutate(
        { id: existingItem.id, data: basePayload as UpdateItemPayload },
        {
          onSuccess: () => goBack(),
          onError: (err: any) => Alert.alert("Failed to Update Product", err?.message || "Something went wrong."),
        }
      );
    } else {
      const payload: CreateItemPayload = {
        shopId: requireActiveShopId(activeShopId),
        ...basePayload,
        initialStock: initialStock ?? 0,
      };
      createMutation.mutate(payload, {
        onSuccess: () => goBack(),
        onError: (err: any) => Alert.alert("Failed to Create Product", err?.message || "Something went wrong."),
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || uploadingImage;
  const isValid = !!form.name.trim() && !!form.unit.trim();

  const inputProps = (key: keyof FormState, label: string, keyboardType?: "default" | "numeric", placeholder?: string) => ({
    mode: "outlined" as const,
    label,
    value: form[key],
    onChangeText: set(key),
    outlineStyle: styles.aeiOutline,
    style: styles.aeiInput,
    keyboardType: keyboardType ?? ("default" as const),
    placeholder,
  });

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader
        title={existingItem ? "Edit Product" : "New Product"}
        subtitle={existingItem ? "Update product details" : "Add to your catalogue"}
        fallbackRoute="ItemList"
      />
      <AppKeyboardAvoidingView>
        <ScrollView
          contentContainerStyle={styles.aeiScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basic Info */}
          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>PRODUCT DETAILS</Text>
            <TextInput {...inputProps("name", "Product Name *")} />
            <View style={styles.aeiRow}>
              <TextInput {...inputProps("sku", "SKU / Code")} style={[styles.aeiInput, { flex: 1 }]} />
              <Pressable onPress={openSkuScanner} style={styles.scanButton} accessibilityRole="button" accessibilityLabel="Scan SKU barcode">
                <Icon source="barcode-scan" size={22} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.aeiRow}>
              <TextInput {...inputProps("unit", "Unit *")} style={[styles.aeiInput, { flex: 1 }]} placeholder="pcs / kg / box" />
            </View>

            {/* Category selector */}
            <Pressable
              onPress={() => setShowCatPicker(true)}
              style={styles.catSelector}
            >
              <Icon source="tag-outline" size={18} color={selectedCat ? colors.primary : colors.textMuted} />
              <Text style={[styles.catSelectorText, !selectedCat && { color: colors.textMuted }]}>
                {selectedCat ? selectedCat.name : "Select Category (optional)"}
              </Text>
              <Icon source="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>PRODUCT PHOTO</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoPreview}>
                {selectedImage?.uri || imageUrl ? (
                  <Image source={{ uri: selectedImage?.uri || imageUrl }} style={styles.photoImage} />
                ) : (
                  <Icon source="image-plus" size={28} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.photoActions}>
                <Button label="Camera" variant="secondary" icon="camera-outline" onPress={() => pickImage("camera")} />
                <Button label="Upload" variant="secondary" icon="image-outline" onPress={() => pickImage("library")} />
              </View>
            </View>
            <Text style={styles.photoHint}>
              Stored under shop/category/item folders in S3 after saving.
            </Text>
          </View>

          {/* Pricing */}
          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>PRICING</Text>
            <TextInput {...inputProps("mrp", "MRP", "numeric")} />
            <TextInput {...inputProps("defaultSellingPrice", "Selling Price", "numeric")} />
            <TextInput {...inputProps("minimumAllowedPrice", "Min Allowed Price", "numeric")} />
            <TextInput {...inputProps("purchasePrice", "Purchase / Cost Price", "numeric")} />
          </View>

          {/* Stock */}
          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>STOCK SETTINGS</Text>
            <TextInput {...inputProps("minimumStock", "Low Stock Alert Below", "numeric")} />
            {!existingItem && (
              <>
                <TextInput {...inputProps("initialStock", "Initial Stock Qty", "numeric")} placeholder="0" />
                <View style={styles.aeiInfoTip}>
                  <Icon source="information-outline" size={14} color={colors.info} />
                  <Text style={styles.aeiInfoTipText}>
                    Enter the starting stock quantity here to initialize it directly.
                  </Text>
                </View>
              </>
            )}
          </View>

          <Button
            label={existingItem ? "Save Changes" : "Create Product"}
            onPress={handleSave}
            loading={isPending}
            disabled={!isValid || isPending}
          />
        </ScrollView>
      </AppKeyboardAvoidingView>

      <CategoryPickerSheet
        visible={showCatPicker}
        categories={categories}
        selectedCategoryId={form.categoryId}
        onSelect={(categoryId) => {
          setForm((f) => ({ ...f, categoryId }));
          setShowCatPicker(false);
        }}
        onDismiss={() => setShowCatPicker(false)}
      />

      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerScreen}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "itf14"],
            }}
            onBarcodeScanned={({ data }) => {
              set("sku")(String(data));
              setScannerVisible(false);
            }}
          />
          <View style={styles.scannerTopBar}>
            <Pressable onPress={() => setScannerVisible(false)} style={styles.scannerClose}>
              <Icon source="close" size={24} color={colors.textInverse} />
            </Pressable>
            <Text style={styles.scannerTitle}>Scan SKU Barcode</Text>
          </View>
          <View style={styles.scanFrame} />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  aeiScroll: {
    padding: spacing.lg,
    paddingBottom: 100,
    gap: spacing.md,
  },
  aeiCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  aeiSectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  aeiRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  scanButton: {
    width: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  aeiInput: {
    backgroundColor: colors.surface,
  },
  aeiOutline: {
    borderRadius: radius.md,
  },
  catSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  catSelectorText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  aeiInfoTip: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  aeiInfoTipText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.info,
    lineHeight: 17,
  },
  photoRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  photoPreview: {
    width: 92,
    height: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoActions: {
    flex: 1,
    gap: spacing.sm,
  },
  photoHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerTopBar: {
    position: "absolute",
    top: 48,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  scannerClose: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  scannerTitle: {
    color: colors.textInverse,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  scanFrame: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "38%",
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
});
