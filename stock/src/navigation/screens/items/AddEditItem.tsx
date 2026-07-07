import { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Switch,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";

import { Item, ItemCategory, ItemBrand, CreateItemPayload, UpdateItemPayload, LocalItemImage, uploadItemImage } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { requireActiveShopId } from "../../../hooks/useActiveShop";
import { useCategoriesQuery, useBrandsQuery, useCreateItemMutation, useItemsQuery, useUpdateItemMutation, useCreateCategoryMutation, useCreateBrandMutation } from "../../../hooks/useItems";
import { Screen } from "../../../components/Screen";
import { AppHeader } from "../../../components/ui/AppHeader";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { AppKeyboardAvoidingView } from "../../../components/ui/AppKeyboardAvoidingView";
import { ImagePickerField } from "../../../components/forms/ImagePickerField";
import { CategoryPickerSheet } from "../../../components/items/CategoryPickerSheet";
import { BrandPickerSheet } from "../../../components/items/BrandPickerSheet";
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
  brandId: string;
  initialStock: string;
};

type BundleComponentForm = {
  componentItemId: string;
  quantity: string;
};

export function AddEditItem() {
  const route = useRoute();
  const params = route.params as any;
  const itemId = params?.itemId;

  const categoriesQuery = useCategoriesQuery();
  const categories: ItemCategory[] = categoriesQuery.data ?? [];
  const brandsQuery = useBrandsQuery();
  const brands: ItemBrand[] = brandsQuery.data ?? [];
  const itemsQuery = useItemsQuery({ limit: 500 });
  const availableItems: Item[] = itemsQuery.data?.items ?? [];

  const existingItem = useMemo(() => {
    return itemId 
      ? availableItems.find(i => i.id === itemId) 
      : params?.item;
  }, [itemId, availableItems, params?.item]);

  const createMutation = useCreateItemMutation();
  const updateMutation = useUpdateItemMutation();
  const createCategoryMutation = useCreateCategoryMutation();
  const createBrandMutation = useCreateBrandMutation();
  const { activeShopId } = useShopStore();
  const token = useAuthStore((s) => s.token);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const nameInputRef = useRef<any>(null);

  const [form, setForm] = useState<FormState>({
    name: existingItem?.name ?? "",
    sku: existingItem?.sku ?? "",
    unit: existingItem?.unit ?? "pcs",
    defaultSellingPrice: existingItem?.defaultSellingPrice?.toString() ?? "",
    minimumAllowedPrice: existingItem?.minimumAllowedPrice?.toString() ?? "",
    mrp: existingItem?.mrp?.toString() ?? "",
    purchasePrice: existingItem?.purchasePrice?.toString() ?? "",
    minimumStock: existingItem?.minimumStock?.toString() ?? "0",
    categoryId: existingItem?.categoryId ?? existingItem?.category?.id ?? "",
    brandId: existingItem?.brandId ?? existingItem?.brand?.id ?? "",
    initialStock: "",
  });

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<LocalItemImage | null>(null);
  const [imageUrl, setImageUrl] = useState(existingItem?.imageUrl ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [componentSearch, setComponentSearch] = useState("");
  const [isBundle, setIsBundle] = useState((existingItem?.bundleComponents ?? []).length > 0);
  const [requiresSerialNumber, setRequiresSerialNumber] = useState(existingItem?.requiresSerialNumber ?? false);
  const [bundleComponents, setBundleComponents] = useState<BundleComponentForm[]>(
    (existingItem?.bundleComponents ?? []).map((component: any) => ({
      componentItemId: component.componentItemId,
      quantity: String(component.quantity ?? 1),
    })),
  );

  useEffect(() => {
    if (existingItem) {
      setForm({
        name: existingItem.name ?? "",
        sku: existingItem.sku ?? "",
        unit: existingItem.unit ?? "pcs",
        defaultSellingPrice: existingItem.defaultSellingPrice?.toString() ?? "",
        minimumAllowedPrice: existingItem.minimumAllowedPrice?.toString() ?? "",
        mrp: existingItem.mrp?.toString() ?? "",
        purchasePrice: existingItem.purchasePrice?.toString() ?? "",
        minimumStock: existingItem.minimumStock?.toString() ?? "0",
        categoryId: existingItem.categoryId ?? existingItem.category?.id ?? "",
        brandId: existingItem.brandId ?? existingItem.brand?.id ?? "",
        initialStock: "",
      });
      setImageUrl(existingItem.imageUrl ?? "");
      setIsBundle((existingItem.bundleComponents ?? []).length > 0);
      setRequiresSerialNumber(existingItem.requiresSerialNumber ?? false);
      setBundleComponents(
        (existingItem.bundleComponents ?? []).map((component: any) => ({
          componentItemId: component.componentItemId,
          quantity: String(component.quantity ?? 1),
        }))
      );
    }
  }, [existingItem]);

  useEffect(() => {
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 150);
  }, []);

  const handleTextChange = (key: keyof FormState) => (value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      
      // Auto-fill pricing rules
      if (key === "mrp") {
        if (!f.defaultSellingPrice || f.defaultSellingPrice === f.mrp) {
          next.defaultSellingPrice = value;
        }
        if (!f.minimumAllowedPrice || f.minimumAllowedPrice === f.defaultSellingPrice || f.minimumAllowedPrice === f.mrp) {
          next.minimumAllowedPrice = value;
        }
      } else if (key === "defaultSellingPrice") {
        if (!f.minimumAllowedPrice || f.minimumAllowedPrice === f.defaultSellingPrice) {
          next.minimumAllowedPrice = value;
        }
      }
      
      return next;
    });
  };

  const set = (key: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const selectedCat = categories.find((c) => c.id === form.categoryId);
  const selectedBrand = brands.find((b) => b.id === form.brandId);
  const selectedComponentIds = new Set(bundleComponents.map((component: any) => component.componentItemId));
  const componentOptions = availableItems
    .filter((item) => item.id !== existingItem?.id)
    .filter((item) => !(item.bundleComponents?.length))
    .filter((item) => !selectedComponentIds.has(item.id))
    .filter((item) => {
      const q = componentSearch.trim().toLowerCase();
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || String(item.sku || "").toLowerCase().includes(q);
    })
    .slice(0, 8);
  const getComponentItem = (id: string) =>
    availableItems.find((item) => item.id === id) ||
    existingItem?.bundleComponents?.find((component: any) => component.componentItemId === id)?.componentItem;

  const addBundleComponent = (itemId: string) => {
    setBundleComponents((current) => [...current, { componentItemId: itemId, quantity: "1" }]);
    setComponentSearch("");
  };

  const updateBundleComponentQty = (itemId: string, quantity: string) => {
    setBundleComponents((current) =>
      current.map((component: any) =>
        component.componentItemId === itemId ? { ...component, quantity } : component,
      ),
    );
  };

  const removeBundleComponent = (itemId: string) => {
    setBundleComponents((current) => current.filter((component: any) => component.componentItemId !== itemId));
  };

  const duplicates = useMemo(() => {
    const trimmedName = form.name.trim().toLowerCase();
    const trimmedSku = form.sku.trim().toLowerCase();
    if (!trimmedName && !trimmedSku) return [];

    const found: Array<{ item: Item; reason: "sku" | "name" | "similar_name" }> = [];

    for (const item of availableItems) {
      if (existingItem && item.id === existingItem.id) continue;

      const itemName = item.name.trim().toLowerCase();
      const itemSku = (item.sku || "").trim().toLowerCase();

      // 1. Check exact SKU match
      if (trimmedSku && itemSku === trimmedSku) {
        found.push({ item, reason: "sku" });
        continue;
      }

      // 2. Check exact Name match
      if (trimmedName && itemName === trimmedName) {
        found.push({ item, reason: "name" });
        continue;
      }

      // 3. Check highly similar Name
      if (trimmedName && trimmedName.length > 3 && itemName.length > 3) {
        const aWords = trimmedName.split(/\s+/).filter(w => w.length > 2);
        const bWords = itemName.split(/\s+/).filter(w => w.length > 2);
        const sharedWords = aWords.filter(w => bWords.includes(w));
        
        const isSubstring = itemName.includes(trimmedName) || trimmedName.includes(itemName);
        const highWordOverlap = aWords.length > 0 && sharedWords.length >= Math.ceil(aWords.length * 0.6);

        if (isSubstring || highWordOverlap) {
          found.push({ item, reason: "similar_name" });
        }
      }
    }

    return found;
  }, [form.name, form.sku, availableItems, existingItem]);

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

  const handleSave = async (addAnother = false, bypassDuplicates = false) => {
    if (!form.name.trim() || !form.unit.trim()) return;

    if (!bypassDuplicates && duplicates.length > 0) {
      const skuDuplicate = duplicates.find((d) => d.reason === "sku");
      if (skuDuplicate) {
        Alert.alert(
          "SKU Already Exists",
          `Another product ("${skuDuplicate.item.name}") is already registered with SKU "${form.sku.trim()}". Barcodes/SKUs must be unique.`
        );
        return;
      }

      const nameDuplicate = duplicates.find((d) => d.reason === "name");
      if (nameDuplicate) {
        Alert.alert(
          "Duplicate Name",
          `A product named "${form.name.trim()}" already exists. Would you still like to create this product?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Create Anyway", onPress: () => handleSave(addAnother, true) }
          ]
        );
        return;
      }

      const similarDuplicate = duplicates.find((d) => d.reason === "similar_name");
      if (similarDuplicate) {
        Alert.alert(
          "Similar Product Exists",
          `A highly similar product "${similarDuplicate.item.name}" already exists (SKU: ${similarDuplicate.item.sku || "No SKU"}). Would you still like to create this product?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Create Anyway", onPress: () => handleSave(addAnother, true) }
          ]
        );
        return;
      }
    }

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
    const normalizedBundleComponents = bundleComponents.map((component: any) => ({
      componentItemId: component.componentItemId,
      quantity: parseQty(component.quantity, 0),
    }));
    if (normalizedBundleComponents.some((component: any) => component.quantity === null || component.quantity <= 0)) {
      Alert.alert("Invalid bundle", "Bundle component quantities must be greater than zero.");
      return;
    }
    if (normalizedBundleComponents.length > 0 && !existingItem && Number(initialStock || 0) > 0) {
      Alert.alert("Invalid stock", "Bundle products do not hold opening stock. Add stock to component products instead.");
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
      brandId: form.brandId || null,
      defaultSellingPrice: sellingPrice,
      minimumAllowedPrice,
      mrp,
      purchasePrice,
      minimumStock: minimumStock ?? 0,
      requiresSerialNumber,
      bundleComponents: normalizedBundleComponents as Array<{ componentItemId: string; quantity: number }>,
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
        onSuccess: () => {
          if (addAnother) {
            setForm({
              name: "",
              sku: "",
              unit: "pcs",
              defaultSellingPrice: "",
              minimumAllowedPrice: "",
              mrp: "",
              purchasePrice: "",
              minimumStock: "0",
              categoryId: form.categoryId,
              brandId: form.brandId,
              initialStock: "",
            });
            setBundleComponents([]);
            setIsBundle(false);
            setRequiresSerialNumber(false);
            setSelectedImage(null);
            setImageUrl("");
            Alert.alert("Success", `${basePayload.name} created! Add the next item.`);
            setTimeout(() => {
              nameInputRef.current?.focus();
            }, 200);
          } else {
            goBack();
          }
        },
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
    onChangeText: handleTextChange(key),
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
            <TextInput ref={nameInputRef} {...inputProps("name", "Product Name *")} />
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

            {/* Brand selector */}
            <Pressable
              onPress={() => setShowBrandPicker(true)}
              style={[styles.catSelector, { marginTop: spacing.sm }]}
            >
              <Icon source="certificate-outline" size={18} color={selectedBrand ? colors.primary : colors.textMuted} />
              <Text style={[styles.catSelectorText, !selectedBrand && { color: colors.textMuted }]}>
                {selectedBrand ? selectedBrand.name : "Select Brand (optional)"}
              </Text>
              <Icon source="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>

            {/* Serial Number Tracking Toggle */}
            <View style={[styles.toggleRow, { marginTop: spacing.md }]}>
              <View style={styles.toggleTextWrap}>
                <Text style={styles.toggleLabel}>Track Serial Number?</Text>
                <Text style={styles.toggleDesc}>Scan/enter serial numbers at the time of sale</Text>
              </View>
              <Switch
                value={requiresSerialNumber}
                onValueChange={setRequiresSerialNumber}
                thumbColor={requiresSerialNumber ? colors.primary : "#f4f3f4"}
                trackColor={{ false: "#767577", true: colors.primaryLight }}
              />
            </View>

            {duplicates.length > 0 && (
              <View style={styles.warningContainer}>
                <View style={styles.warningHeader}>
                  <Icon source="alert-circle-outline" size={18} color="#b45309" />
                  <Text style={styles.warningTitle}>Potential Duplicate Found</Text>
                </View>
                <View style={styles.warningBody}>
                  {duplicates.map(({ item, reason }) => (
                    <Text key={item.id} style={styles.warningText}>
                      • <Text style={styles.boldText}>{item.name}</Text>
                      {reason === "sku" ? ` already has the SKU "${item.sku}"` : 
                       reason === "name" ? " matches this product name exactly" : 
                       ` has a very similar name (SKU: ${item.sku || "No SKU"})`}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={styles.aeiCard}>
            <Text style={styles.aeiSectionLabel}>PRODUCT PHOTO</Text>
            <ImagePickerField
              uri={selectedImage?.uri || imageUrl}
              onCamera={() => pickImage("camera")}
              onLibrary={() => pickImage("library")}
              uploading={uploadingImage}
            />
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

          <View style={styles.aeiCard}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextWrap}>
                <Text style={styles.toggleLabel}>Is Bundle / Kit Product?</Text>
                <Text style={styles.toggleDesc}>For composite virtual kits made of other items</Text>
              </View>
              <Switch
                value={isBundle}
                onValueChange={(val) => {
                  setIsBundle(val);
                  if (!val) {
                    setBundleComponents([]);
                  }
                }}
                thumbColor={isBundle ? colors.primary : "#f4f3f4"}
                trackColor={{ false: "#767577", true: colors.primaryLight }}
              />
            </View>

            {isBundle && (
              <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                <Text style={styles.bundleHint}>
                  Add components only for virtual kits, for example 071 Cartridge x 1 and 071 Chip x 1.
                </Text>

                {bundleComponents.map((component: any) => {
                  const componentItem = getComponentItem(component.componentItemId);
                  return (
                    <View key={component.componentItemId} style={styles.bundleRow}>
                      <View style={styles.bundleNameWrap}>
                        <Text style={styles.bundleName} numberOfLines={1}>
                          {componentItem?.name || "Component product"}
                        </Text>
                        {!!componentItem?.sku && (
                          <Text style={styles.bundleSku} numberOfLines={1}>
                            {componentItem.sku}
                          </Text>
                        )}
                      </View>
                      <TextInput
                        mode="outlined"
                        label="Qty"
                        value={component.quantity}
                        onChangeText={(value) => updateBundleComponentQty(component.componentItemId, value)}
                        keyboardType="numeric"
                        style={styles.bundleQtyInput}
                        outlineStyle={styles.aeiOutline}
                      />
                      <Pressable
                        onPress={() => removeBundleComponent(component.componentItemId)}
                        style={styles.removeComponentButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${componentItem?.name || "component"}`}
                        hitSlop={8}
                      >
                        <Icon source="close" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  );
                })}

                <TextInput
                  mode="outlined"
                  label="Search component product"
                  value={componentSearch}
                  onChangeText={setComponentSearch}
                  outlineStyle={styles.aeiOutline}
                  style={styles.aeiInput}
                />
                <View style={styles.componentOptions}>
                  {componentOptions.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => addBundleComponent(item.id)}
                      style={styles.componentOption}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${item.name} as bundle component`}
                    >
                      <View style={styles.bundleNameWrap}>
                        <Text style={styles.componentOptionTitle} numberOfLines={1}>{item.name}</Text>
                        {!!item.sku && <Text style={styles.bundleSku} numberOfLines={1}>{item.sku}</Text>}
                      </View>
                      <Icon source="plus-circle-outline" size={20} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={styles.saveButtonsRow}>
            <Button
              label={existingItem ? "Save Changes" : "Create Product"}
              onPress={() => handleSave(false)}
              loading={isPending}
              disabled={!isValid || isPending}
              style={{ flex: 1 }}
            />
            {!existingItem && (
              <Button
                label="Save & Add Another"
                onPress={() => handleSave(true)}
                loading={isPending}
                disabled={!isValid || isPending}
                variant="secondary"
                style={{ flex: 1 }}
              />
            )}
          </View>
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
        onCreateNew={async (name) => {
          const newCat = await createCategoryMutation.mutateAsync(name);
          setForm((f) => ({ ...f, categoryId: newCat.id }));
          setShowCatPicker(false);
        }}
      />

      <BrandPickerSheet
        visible={showBrandPicker}
        brands={brands}
        selectedBrandId={form.brandId}
        onSelect={(brandId) => {
          setForm((f) => ({ ...f, brandId }));
          setShowBrandPicker(false);
        }}
        onDismiss={() => setShowBrandPicker(false)}
        onCreateNew={async (name) => {
          const newBrand = await createBrandMutation.mutateAsync(name);
          setForm((f) => ({ ...f, brandId: newBrand.id }));
          setShowBrandPicker(false);
        }}
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
              handleTextChange("sku")(String(data));
              setScannerVisible(false);
              setTimeout(() => {
                nameInputRef.current?.focus();
              }, 150);
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleTextWrap: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  toggleDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  warningContainer: {
    marginTop: spacing.md,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  warningTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: "#92400e",
  },
  warningBody: {
    gap: 4,
    marginTop: 2,
  },
  warningText: {
    fontSize: 12,
    color: "#b45309",
    lineHeight: 16,
  },
  boldText: {
    fontWeight: fontWeight.bold,
  },
  saveButtonsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
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
  photoHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  bundleHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  bundleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bundleNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  bundleName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  bundleSku: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  bundleQtyInput: {
    width: 82,
    backgroundColor: colors.surface,
  },
  removeComponentButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerLight,
  },
  componentOptions: {
    gap: spacing.sm,
  },
  componentOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  componentOptionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
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
