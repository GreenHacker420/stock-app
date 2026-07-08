import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  Switch,
  Keyboard,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";
import { Image } from "expo-image";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";

import { Item, ItemCategory, ItemBrand, CreateItemPayload, UpdateItemPayload, LocalItemImage, uploadItemImage } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { requireActiveShopId } from "../../../hooks/useActiveShop";
import { useCategoriesQuery, useBrandsQuery, useCreateItemMutation, useItemsQuery, useUpdateItemMutation, useCreateCategoryMutation, useCreateBrandMutation, useItemQuery } from "../../../hooks/useItems";
import { Screen } from "../../../components/Screen";
import { AppHeader } from "../../../components/ui/AppHeader";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonList } from "../../../components/ui/SkeletonCard";
import { AppKeyboardAvoidingView } from "../../../components/ui/AppKeyboardAvoidingView";
import { ImagePickerField } from "../../../components/forms/ImagePickerField";
import { CategoryPickerSheet } from "../../../components/items/CategoryPickerSheet";
import { BrandPickerSheet } from "../../../components/items/BrandPickerSheet";
import { colors, spacing, radius, fontSize, fontWeight } from "../../../theme";
import { navigate, goBack } from "../../navigation-ref";
import { AddEditItemRouteParams } from "../../../types/items";
import { parseAmount, parseQty } from "../../../utils/items/validation";
import { triggerLightHaptic } from "../../../utils/haptics";

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
  const navigation = useNavigation<any>();
  const params = route.params as AddEditItemRouteParams | undefined;
  const itemId = params?.itemId;

  const categoriesQuery = useCategoriesQuery();
  const categories: ItemCategory[] = categoriesQuery.data ?? [];
  const brandsQuery = useBrandsQuery();
  const brands: ItemBrand[] = brandsQuery.data ?? [];
  const itemsQuery = useItemsQuery({ limit: 500 });
  const availableItems: Item[] = itemsQuery.data?.items ?? [];

  const itemQuery = useItemQuery(itemId, { enabled: !!itemId });
  const existingItem = itemQuery.data;

  const createMutation = useCreateItemMutation();
  const updateMutation = useUpdateItemMutation();
  const createCategoryMutation = useCreateCategoryMutation();
  const createBrandMutation = useCreateBrandMutation();
  const { activeShopId } = useShopStore();
  const token = useAuthStore((s) => s.token);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const nameInputRef = useRef<any>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedItemIdRef = useRef<string | null>(null);
  const hasScanned = useRef(false);
  const submittingRef = useRef(false);
  const savedRef = useRef(false);
  const workflowShopIdRef = useRef<string | null>(activeShopId ?? null);

  const [form, setForm] = useState<FormState>({
    name: "",
    sku: "",
    unit: "pcs",
    defaultSellingPrice: "",
    minimumAllowedPrice: "",
    mrp: "",
    purchasePrice: "",
    minimumStock: "0",
    categoryId: "",
    brandId: "",
    initialStock: "",
  });

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const isKeyboardOpen = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      isKeyboardOpen.current = true;
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      isKeyboardOpen.current = false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const openCategoryPicker = () => {
    if (isKeyboardOpen.current) {
      Keyboard.dismiss();
      let triggered = false;
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        if (!triggered) {
          triggered = true;
          setShowCatPicker(true);
        }
      });
      // Fallback
      setTimeout(() => {
        sub.remove();
        if (!triggered) {
          triggered = true;
          setShowCatPicker(true);
        }
      }, 350);
    } else {
      setShowCatPicker(true);
    }
  };

  const openBrandPicker = () => {
    if (isKeyboardOpen.current) {
      Keyboard.dismiss();
      let triggered = false;
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        if (!triggered) {
          triggered = true;
          setShowBrandPicker(true);
        }
      });
      // Fallback
      setTimeout(() => {
        sub.remove();
        if (!triggered) {
          triggered = true;
          setShowBrandPicker(true);
        }
      }, 350);
    } else {
      setShowBrandPicker(true);
    }
  };
  const [selectedImages, setSelectedImages] = useState<LocalItemImage[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(existingItem?.imageUrl ? existingItem.imageUrl.split(",").filter(Boolean) : []);
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
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const buildSnapshot = useCallback(
    (values: {
      form: FormState;
      imageUrls: string[];
      selectedImages: LocalItemImage[];
      isBundle: boolean;
      requiresSerialNumber: boolean;
      bundleComponents: BundleComponentForm[];
    }) =>
      JSON.stringify({
        form: values.form,
        imageUrls: values.imageUrls,
        selectedImages: values.selectedImages.map(img => img.uri),
        isBundle: values.isBundle,
        requiresSerialNumber: values.requiresSerialNumber,
        bundleComponents: values.bundleComponents,
      }),
    [],
  );

  useEffect(() => {
    if (!itemId) {
      if (hydratedItemIdRef.current !== null) {
        hydratedItemIdRef.current = null;
      }
      return;
    }

    if (existingItem && hydratedItemIdRef.current !== itemId) {
      workflowShopIdRef.current = existingItem.shopId ?? null;
      const nextForm = {
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
      };
      const nextImageUrls = existingItem.imageUrl ? existingItem.imageUrl.split(",").filter(Boolean) : [];
      const nextIsBundle = (existingItem.bundleComponents ?? []).length > 0;
      const nextRequiresSerialNumber = existingItem.requiresSerialNumber ?? false;
      const nextBundleComponents = (existingItem.bundleComponents ?? []).map((component: any) => ({
          componentItemId: component.componentItemId,
          quantity: String(component.quantity ?? 1),
        }));

      setForm(nextForm);
      setImageUrls(nextImageUrls);
      setSelectedImages([]);
      setIsBundle(nextIsBundle);
      setRequiresSerialNumber(nextRequiresSerialNumber);
      setBundleComponents(nextBundleComponents);
      setInitialSnapshot(
        buildSnapshot({
          form: nextForm,
          imageUrls: nextImageUrls,
          selectedImages: [],
          isBundle: nextIsBundle,
          requiresSerialNumber: nextRequiresSerialNumber,
          bundleComponents: nextBundleComponents,
        }),
      );
      hydratedItemIdRef.current = itemId;
    }
  }, [buildSnapshot, existingItem, itemId]);

  useEffect(() => {
    focusTimerRef.current = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 150);
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
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

  const currentSnapshot = useMemo(
    () =>
      buildSnapshot({
        form,
        imageUrls,
        selectedImages,
        isBundle,
        requiresSerialNumber,
        bundleComponents,
      }),
    [buildSnapshot, bundleComponents, form, imageUrls, isBundle, requiresSerialNumber, selectedImages],
  );

  useEffect(() => {
    if (!itemId && initialSnapshot === null) {
      workflowShopIdRef.current = activeShopId ?? null;
      setInitialSnapshot(currentSnapshot);
    }
  }, [activeShopId, currentSnapshot, initialSnapshot, itemId]);

  const isDirty = !!initialSnapshot && currentSnapshot !== initialSnapshot && !savedRef.current;

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
    hasScanned.current = false;
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
        quality: 0.5,
        allowsEditing: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const newImg = {
        uri: asset.uri,
        name: asset.fileName || `product-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      };
      setSelectedImages((prev) => [...prev, newImg]);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access required", "Allow photo access to choose product photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      allowsEditing: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const newImg = {
      uri: asset.uri,
      name: asset.fileName || `product-${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    };
    setSelectedImages((prev) => [...prev, newImg]);
  };

  const uploadSelectedImages = async () => {
    if (selectedImages.length === 0) return imageUrls;
    if (!token || !activeShopId) throw new Error("You must be logged in to upload product photos.");
    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const img of selectedImages) {
        const uploaded = await uploadItemImage(
          token,
          {
            shopId: activeShopId,
            categoryId: form.categoryId || null,
            itemId: itemId || null,
          },
          img,
        );
        uploadedUrls.push(uploaded.url);
      }
      const allUrls = [...imageUrls, ...uploadedUrls];
      setImageUrls(allUrls);
      setSelectedImages([]);
      return allUrls;
    } finally {
      setUploadingImage(false);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || uploadingImage;

  const handleSave = async (
    addAnother = false,
    bypassDuplicates = false,
    afterSuccess?: () => void,
  ): Promise<boolean> => {
    if (isPending || submittingRef.current) return false;
    if (!form.name.trim() || !form.unit.trim()) return false;

    const workflowShopId = workflowShopIdRef.current ?? activeShopId;
    if (!workflowShopId || (activeShopId && workflowShopId !== activeShopId)) {
      Alert.alert(
        "Shop changed",
        "This product form belongs to another shop. Save or discard it before switching shops.",
      );
      return false;
    }

    if (!bypassDuplicates && duplicates.length > 0) {
      const skuDuplicate = duplicates.find((d) => d.reason === "sku");
      if (skuDuplicate) {
        Alert.alert(
          "SKU Already Exists",
          `Another product ("${skuDuplicate.item.name}") is already registered with SKU "${form.sku.trim()}". Barcodes/SKUs must be unique.`
        );
        return false;
      }

      const nameDuplicate = duplicates.find((d) => d.reason === "name");
      if (nameDuplicate) {
        Alert.alert(
          "Duplicate Name",
          `A product named "${form.name.trim()}" already exists. Would you still like to create this product?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Create Anyway", onPress: () => void handleSave(addAnother, true, afterSuccess) }
          ]
        );
        return false;
      }

      const similarDuplicate = duplicates.find((d) => d.reason === "similar_name");
      if (similarDuplicate) {
        Alert.alert(
          "Similar Product Exists",
          `A highly similar product "${similarDuplicate.item.name}" already exists (SKU: ${similarDuplicate.item.sku || "No SKU"}). Would you still like to create this product?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Create Anyway", onPress: () => void handleSave(addAnother, true, afterSuccess) }
          ]
        );
        return false;
      }
    }

    const mrp = parseAmount(form.mrp, null);
    if (form.mrp.trim() && mrp === null) {
      Alert.alert("Invalid price", "MRP must be a valid non-negative number.");
      return false;
    }
    const minimumAllowedPrice = parseAmount(form.minimumAllowedPrice, null);
    if (form.minimumAllowedPrice.trim() && minimumAllowedPrice === null) {
      Alert.alert("Invalid price", "Min allowed price must be a valid non-negative number.");
      return false;
    }
    const purchasePrice = parseAmount(form.purchasePrice, null);
    if (form.purchasePrice.trim() && purchasePrice === null) {
      Alert.alert("Invalid price", "Purchase price must be a valid non-negative number.");
      return false;
    }
    const defaultSellingPrice = parseAmount(form.defaultSellingPrice, 0);
    if (form.defaultSellingPrice.trim() && defaultSellingPrice === null) {
      Alert.alert("Invalid price", "Selling price must be a valid non-negative number.");
      return false;
    }
    const minimumStock = parseQty(form.minimumStock, 0);
    if (form.minimumStock.trim() && minimumStock === null) {
      Alert.alert("Invalid stock", "Low stock alert must be a whole number.");
      return false;
    }
    const initialStock = parseQty(form.initialStock, 0);
    if (form.initialStock.trim() && initialStock === null) {
      Alert.alert("Invalid stock", "Initial stock must be a whole number.");
      return false;
    }
    if (requiresSerialNumber && (initialStock ?? 0) > 0 && !existingItem) {
      Alert.alert("Invalid Stock", "Serialized products cannot receive opening stock. Add stock via stock entry / purchase receipt specifying serial numbers instead.");
      return false;
    }
    const normalizedBundleComponents = bundleComponents.map((component: any) => ({
      componentItemId: component.componentItemId,
      quantity: parseQty(component.quantity, 0),
    }));
    if (isBundle && normalizedBundleComponents.length === 0) {
      Alert.alert("Invalid Bundle", "Virtual bundle products require at least one component product.");
      return false;
    }
    const bundleComponentIds = normalizedBundleComponents.map((component) => component.componentItemId);
    if (existingItem && bundleComponentIds.includes(existingItem.id)) {
      Alert.alert("Invalid Bundle", "A bundle cannot include itself as a component.");
      return false;
    }
    if (new Set(bundleComponentIds).size !== bundleComponentIds.length) {
      Alert.alert("Invalid Bundle", "Each component product can be added only once.");
      return false;
    }
    const nestedBundleComponent = availableItems.find(
      (item) => bundleComponentIds.includes(item.id) && (item.bundleComponents?.length ?? 0) > 0,
    );
    if (nestedBundleComponent) {
      Alert.alert(
        "Invalid Bundle",
        `${nestedBundleComponent.name} is already a bundle. Add its component products directly instead.`,
      );
      return false;
    }
    if (normalizedBundleComponents.some((component: any) => component.quantity === null || component.quantity <= 0)) {
      Alert.alert("Invalid bundle", "Bundle component quantities must be greater than zero.");
      return false;
    }
    if (normalizedBundleComponents.length > 0 && !existingItem && Number(initialStock || 0) > 0) {
      Alert.alert("Invalid stock", "Bundle products do not hold opening stock. Add stock to component products instead.");
      return false;
    }

    const sellingPrice = defaultSellingPrice ?? 0;
    if (mrp !== null && sellingPrice > mrp) {
      Alert.alert("Invalid price", "Selling price cannot be greater than MRP.");
      return false;
    }
    if (minimumAllowedPrice !== null && minimumAllowedPrice > sellingPrice) {
      Alert.alert("Invalid price", "Minimum allowed price cannot be greater than selling price.");
      return false;
    }

    let finalImageUrl: string | null = null;
    submittingRef.current = true;
    try {
      const allUrls = await uploadSelectedImages();
      finalImageUrl = allUrls.length > 0 ? allUrls.join(",") : null;
    } catch (err: any) {
      Alert.alert("Photo Upload Failed", err?.message || "Could not upload product photo.");
      submittingRef.current = false;
      return false;
    }

    const basePayload = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      sku: form.sku.trim() || null,
      imageUrl: finalImageUrl,
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

    try {
      if (existingItem) {
        await updateMutation.mutateAsync({ id: existingItem.id, data: basePayload as UpdateItemPayload });
        savedRef.current = true;
        setInitialSnapshot(currentSnapshot);
        if (afterSuccess) {
          afterSuccess();
        } else {
          goBack();
        }
      } else {
        const payload: CreateItemPayload = {
          shopId: requireActiveShopId(workflowShopId),
          ...basePayload,
          initialStock: initialStock ?? 0,
        };
        await createMutation.mutateAsync(payload);
        savedRef.current = true;
        if (afterSuccess) {
          afterSuccess();
        } else {
          if (addAnother) {
            const nextForm = {
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
            };
            setForm({
              ...nextForm,
            });
            setBundleComponents([]);
            setIsBundle(false);
            setRequiresSerialNumber(false);
            setSelectedImages([]);
            setImageUrls([]);
            savedRef.current = false;
            setInitialSnapshot(
              buildSnapshot({
                form: nextForm,
                imageUrls: [],
                selectedImages: [],
                isBundle: false,
                requiresSerialNumber: false,
                bundleComponents: [],
              }),
            );
            Alert.alert("Success", `${basePayload.name} created! Add the next item.`);
            focusTimerRef.current = setTimeout(() => {
              nameInputRef.current?.focus();
            }, 200);
          } else {
            goBack();
          }
        }
      }
      return true;
    } catch (err: any) {
      Alert.alert(
        existingItem ? "Failed to Update Product" : "Failed to Create Product",
        err?.message || "Something went wrong.",
      );
      return false;
    } finally {
      submittingRef.current = false;
    }
  };

  const isValid = !!form.name.trim() && !!form.unit.trim();

  const confirmUnsavedAction = useCallback(
    (onDiscard: () => void, onSave?: () => void) => {
      Alert.alert(
        "Unsaved product changes",
        "Save this product before leaving, or discard the changes.",
        [
          { text: "Keep Editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: onDiscard },
          ...(onSave ? [{ text: "Save", onPress: onSave }] : []),
        ],
      );
    },
    [],
  );

  const requestLeave = useCallback(
    (proceed: () => void) => {
      if (!isDirty || submittingRef.current) {
        proceed();
        return;
      }
      confirmUnsavedAction(
        () => {
          savedRef.current = true;
          proceed();
        },
        () => {
          void handleSave(false, false, proceed);
        },
      );
    },
    [confirmUnsavedAction, handleSave, isDirty],
  );

  const requestShopSwitch = useCallback(
    (_shopId: string, proceed: () => void) => {
      requestLeave(proceed);
    },
    [requestLeave],
  );

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event: any) => {
        if (!isDirty || submittingRef.current) return;
        event.preventDefault();
        requestLeave(() => navigation.dispatch(event.data.action));
      }),
    [isDirty, navigation, requestLeave],
  );

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

  if (itemId && itemQuery.isLoading) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Edit Product" fallbackRoute="ItemList" />
        <SkeletonList count={6} itemHeight={60} />
      </Screen>
    );
  }

  if (itemId && itemQuery.isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Edit Product" fallbackRoute="ItemList" />
        <EmptyState
          icon="package-variant-closed"
          title="Product not found"
          subtitle={itemQuery.error?.message || "Could not retrieve details for this product."}
          action={
            <Button
              label="Back to Catalog"
              onPress={() => navigate("ItemList")}
            />
          }
        />
      </Screen>
    );
  }

  if (itemId && existingItem && activeShopId && existingItem.shopId !== activeShopId) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Access Denied" fallbackRoute="ItemList" />
        <EmptyState
          icon="store-alert-outline"
          title="Shop Mismatch"
          subtitle="This product belongs to another shop. Switch shops first to edit it."
          action={
            <Button
              label="Go Back"
              onPress={() => navigate("ItemList")}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader
        title={existingItem ? "Edit Product" : "New Product"}
        subtitle={existingItem ? "Update product details" : "Add to your catalogue"}
        fallbackRoute="ItemList"
        onBack={() => requestLeave(goBack)}
        onRequestShopSwitch={requestShopSwitch}
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
              onPress={openCategoryPicker}
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
              onPress={openBrandPicker}
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
            <Text style={styles.aeiSectionLabel}>PRODUCT PHOTOS</Text>
            <View style={{ gap: spacing.md }}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.md, alignItems: 'center' }}
              >
                {/* 1. Render currently uploaded images */}
                {imageUrls.map((url, idx) => (
                  <View key={`uploaded-${idx}`} style={styles.thumbnailWrapper}>
                    <Image source={{ uri: url }} style={styles.thumbnailImage} />
                    <Pressable
                      style={styles.thumbnailDeleteBtn}
                      onPress={() => {
                        triggerLightHaptic();
                        setImageUrls(prev => prev.filter((_, i) => i !== idx));
                      }}
                    >
                      <Icon source="close-circle" size={20} color={colors.danger} />
                    </Pressable>
                    {idx === 0 && (
                      <View style={styles.primaryCoverBadge}>
                        <Text style={styles.primaryCoverText}>COVER</Text>
                      </View>
                    )}
                  </View>
                ))}

                {/* 2. Render newly picked local images */}
                {selectedImages.map((img, idx) => (
                  <View key={`local-${idx}`} style={styles.thumbnailWrapper}>
                    <Image source={{ uri: img.uri }} style={styles.thumbnailImage} />
                    <Pressable
                      style={styles.thumbnailDeleteBtn}
                      onPress={() => {
                        triggerLightHaptic();
                        setSelectedImages(prev => prev.filter((_, i) => i !== idx));
                      }}
                    >
                      <Icon source="close-circle" size={20} color={colors.danger} />
                    </Pressable>
                    {imageUrls.length === 0 && idx === 0 && (
                      <View style={styles.primaryCoverBadge}>
                        <Text style={styles.primaryCoverText}>COVER</Text>
                      </View>
                    )}
                  </View>
                ))}

                {/* 3. Render picker triggers if total count is under limit (5 images) */}
                {imageUrls.length + selectedImages.length < 5 && (
                  <View style={styles.pickerTriggerButtonsContainer}>
                    <Pressable 
                      style={styles.inlinePickerBtn}
                      onPress={() => pickImage("camera")}
                      disabled={uploadingImage}
                    >
                      <Icon source="camera-outline" size={24} color={colors.primary} />
                      <Text style={styles.inlinePickerBtnText}>Camera</Text>
                    </Pressable>
                    <Pressable 
                      style={styles.inlinePickerBtn}
                      onPress={() => pickImage("library")}
                      disabled={uploadingImage}
                    >
                      <Icon source="image-outline" size={24} color={colors.primary} />
                      <Text style={styles.inlinePickerBtnText}>Upload</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
              <Text style={styles.photoHint}>
                First photo acts as the primary cover. Upload up to 5 photos.
              </Text>
            </View>
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
          try {
            const newCat = await createCategoryMutation.mutateAsync(name);
            setForm((f) => ({ ...f, categoryId: newCat.id }));
            setShowCatPicker(false);
          } catch (err: any) {
            Alert.alert("Failed to Create Category", err?.message || "Something went wrong.");
          }
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
          try {
            const newBrand = await createBrandMutation.mutateAsync(name);
            setForm((f) => ({ ...f, brandId: newBrand.id }));
            setShowBrandPicker(false);
          } catch (err: any) {
            Alert.alert("Failed to Create Brand", err?.message || "Something went wrong.");
          }
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
              if (hasScanned.current) return;
              hasScanned.current = true;
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
  thumbnailWrapper: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailDeleteBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 10,
  },
  primaryCoverBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(10, 132, 255, 0.85)",
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCoverText: {
    fontSize: 8,
    fontWeight: fontWeight.bold,
    color: "#fff",
  },
  pickerTriggerButtonsContainer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inlinePickerBtn: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.primary + "10",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  inlinePickerBtnText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});
