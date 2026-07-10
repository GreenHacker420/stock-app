import React, { useMemo, useState, memo, useCallback, useRef, useEffect } from "react";
import { 
  View, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  Pressable, 
  TextInput as RNTextInput,
  ScrollView,
  Alert,
  PanResponder,
  Animated,
  Modal
} from "react-native";
import { Text, Icon, TextInput, SegmentedButtons, List, Divider } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { Item, Customer, fetchItems } from "../../api/client";
import { useItemsQuery } from "../../hooks/useItems";
import { useCreateSaleMutation } from "../../hooks/useSales";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useShopsQuery } from "../../hooks/useShops";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { SerialNumberScannerModal } from "../../components/items/SerialNumberScannerModal";
import { ProductSkuScannerModal } from "../../components/items/ProductSkuScannerModal";
import { DynamicUpiQr } from "../../components/ui/DynamicUpiQr";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { InfoRow } from "../../components/ui/InfoRow";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { shareSaleInvoicePdf, printSaleInvoiceDirect } from "../../utils/pdf";
import { triggerLightHaptic } from "../../utils/haptics";
import { itemDisplayName } from "../../utils/items/display";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}
const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

const SaleItemCard = memo(({ 
  item, 
  quantity, 
  serialNumbers,
  onScanPress,
  onAdd, 
  onRemove 
}: { 
  item: Item, 
  quantity: number, 
  serialNumbers?: string[],
  onScanPress?: () => void,
  onAdd: () => void, 
  onRemove: () => void 
}) => {
  const stockQty = item.availableStock ?? 0;
  const isOutOfStock = stockQty <= 0;
  const isMaxStockReached = quantity >= stockQty;
  const hasQty = quantity > 0;

  const intervalRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startIncrement = () => {
    if (isMaxStockReached) return;
    onAdd();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onAdd();
      }, 120);
    }, 350);
  };

  const stopIncrement = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startDecrement = () => {
    onRemove();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onRemove();
      }, 120);
    }, 350);
  };

  const stopDecrement = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <View style={[
      styles.itemCard,
      hasQty && styles.itemCardActive
    ]}>
      {/* Left Icon Avatar */}
      <View style={[
        styles.itemAvatarContainer,
        hasQty && styles.itemAvatarContainerActive
      ]}>
        <Icon 
          source="package-variant-closed" 
          size={22} 
          color={hasQty ? colors.primary : colors.textSecondary} 
        />
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.itemSubtitle}>
            {item.sku || "No SKU"} • {money(item.defaultSellingPrice)} / {item.unit}
          </Text>
          {isOutOfStock ? (
            <View style={styles.outOfStockBadge}>
              <Text style={styles.outOfStockText}>OUT OF STOCK</Text>
            </View>
          ) : stockQty <= 10 ? (
            <View style={[styles.stockBadge, styles.stockBadgeLow]}>
              <Text style={[styles.stockText, styles.stockTextLow]}>Low Stock: {stockQty}</Text>
            </View>
          ) : (
            <View style={styles.stockBadge}>
              <Text style={styles.stockText}>Stock: {stockQty} {item.unit}</Text>
            </View>
          )}
        </View>
        {hasQty && !!item.requiresSerialNumber && (
          <Pressable onPress={onScanPress} style={styles.serialStatusRow}>
            {serialNumbers && serialNumbers.length === quantity ? (
              <>
                <Icon source="check-circle" size={14} color={colors.success} />
                <Text style={styles.serialStatusSuccessText} numberOfLines={1}>
                  S/N: {serialNumbers.join(", ")}
                </Text>
              </>
            ) : (
              <>
                <Icon source="alert-circle" size={14} color={colors.danger} />
                <Text style={styles.serialStatusWarningText} numberOfLines={1}>
                  Tap to scan {quantity - (serialNumbers?.length ?? 0)} serial(s)
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
      
      <View style={styles.quantityControls}>
        {quantity === 0 ? (
          <Pressable 
            onPress={onAdd}
            disabled={isOutOfStock}
            style={({ pressed }) => [
              styles.addButton,
              isOutOfStock && styles.disabledButton,
              pressed && !isOutOfStock && styles.buttonPressed
            ]}
          >
            <Icon source="plus" size={24} color={isOutOfStock ? colors.textMuted : colors.primary} />
            <Text style={[styles.addButtonLabel, isOutOfStock && styles.disabledButtonLabel]}>
              {isOutOfStock ? "NO STOCK" : "ADD"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.counterRow}>
            <Pressable 
              onPressIn={startDecrement}
              onPressOut={stopDecrement}
              style={({ pressed }) => [
                styles.qtyButton,
                pressed && styles.buttonPressed
              ]}
            >
              <Icon source="minus" size={20} color={colors.primary} />
            </Pressable>
            
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyText}>{quantity}</Text>
            </View>
            
            <Pressable 
              onPressIn={startIncrement}
              onPressOut={stopIncrement}
              disabled={isMaxStockReached}
              style={({ pressed }) => [
                styles.qtyButton,
                isMaxStockReached && styles.disabledQtyButton,
                pressed && !isMaxStockReached && styles.buttonPressed
              ]}
            >
              <Icon source="plus" size={20} color={isMaxStockReached ? colors.textMuted : colors.primary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}, (p, n) => 
  p.item.id === n.item.id && 
  p.quantity === n.quantity &&
  p.serialNumbers?.join(",") === n.serialNumbers?.join(",")
);

const CartItem = memo(({ 
  item, 
  quantity, 
  customRate, 
  serialNumbers,
  onScanPress,
  onUpdateRate,
  onUpdateQuantity,
  userRole
}: { 
  item: Item;
  quantity: number;
  customRate?: number;
  serialNumbers?: string[];
  onScanPress?: () => void;
  onUpdateRate: (rate: number | undefined) => void;
  onUpdateQuantity: (qty: number) => void;
  userRole?: string;
}) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [rateInput, setRateInput] = useState(String(customRate ?? item.defaultSellingPrice));
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    setRateInput(String(customRate ?? item.defaultSellingPrice));
  }, [customRate, item.defaultSellingPrice]);

  const defaultPrice = Number(item.defaultSellingPrice || 0);
  const minPrice = item.minimumAllowedPrice !== null && item.minimumAllowedPrice !== undefined
    ? Number(item.minimumAllowedPrice)
    : defaultPrice;

  const currentRate = customRate !== undefined ? customRate : defaultPrice;

  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && gestureState.dx > 0;
      },
      onPanResponderGrant: () => {
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(0, Math.min(100, gestureState.dx));
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 60) {
          setShowEditModal(true);
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 8,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.swipeUnderlay}>
        <View style={styles.swipeUnderlayContent}>
          <Icon source="pencil" size={20} color="#ffffff" />
          <Text style={styles.swipeUnderlayText}>Edit Price</Text>
        </View>
      </View>

      <Animated.View
        style={[
          styles.cartReviewRow,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.cartItemLeft}>
          <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cartItemPrice}>
            {customRate !== undefined ? (
              <>
                <Text style={{ textDecorationLine: "line-through" }}>{money(item.defaultSellingPrice)}</Text>
                {"  "}
                <Text style={{ color: colors.success, fontWeight: "bold" }}>{money(customRate)}</Text>
              </>
            ) : (
              money(item.defaultSellingPrice)
            )}
            {" • Stock: "}{item.availableStock ?? 0}
          </Text>
          {!!item.requiresSerialNumber && (
            <Pressable onPress={onScanPress} style={styles.serialStatusRow}>
              {serialNumbers && serialNumbers.length === quantity ? (
                <>
                  <Icon source="check-circle" size={14} color={colors.success} />
                  <Text style={styles.serialStatusSuccessText} numberOfLines={1}>
                    S/N: {serialNumbers.join(", ")}
                  </Text>
                </>
              ) : (
                <>
                  <Icon source="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.serialStatusWarningText} numberOfLines={1}>
                    Tap to scan {quantity - (serialNumbers?.length ?? 0)} serial(s)
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.counterRow}>
          <Pressable 
            onPress={() => onUpdateQuantity(quantity - 1)}
            style={({ pressed }) => [
              styles.qtyButton,
              pressed && styles.buttonPressed
            ]}
          >
            <Icon source="minus" size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.qtyDisplay}>
            <Text style={styles.qtyText}>{quantity}</Text>
          </View>
          <Pressable 
            onPress={() => onUpdateQuantity(quantity + 1)}
            disabled={quantity >= (item.availableStock ?? 0)}
            style={({ pressed }) => [
              styles.qtyButton,
              quantity >= (item.availableStock ?? 0) && styles.disabledQtyButton,
              pressed && quantity < (item.availableStock ?? 0) && styles.buttonPressed
            ]}
          >
            <Icon source="plus" size={18} color={quantity >= (item.availableStock ?? 0) ? colors.textMuted : colors.primary} />
          </Pressable>
        </View>

        <View style={styles.cartItemRight}>
          <Text style={styles.cartItemSubtotal}>{money(quantity * currentRate)}</Text>
        </View>
      </Animated.View>

      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Item Price</Text>
            <Text style={styles.modalItemName}>{item.name}</Text>
            
            <View style={styles.pricingDetailsGrid}>
              <View style={styles.pricingGridCell}>
                <Text style={styles.pricingGridLabel}>MRP</Text>
                <Text style={styles.pricingGridValue}>{item.mrp ? money(item.mrp) : "N/A"}</Text>
              </View>
              <View style={styles.pricingGridCell}>
                <Text style={styles.pricingGridLabel}>Selling Price</Text>
                <Text style={styles.pricingGridValue}>{money(item.defaultSellingPrice)}</Text>
              </View>
              <View style={styles.pricingGridCell}>
                <Text style={styles.pricingGridLabel}>Min Price</Text>
                <Text style={styles.pricingGridValue}>{item.minimumAllowedPrice ? money(item.minimumAllowedPrice) : money(item.defaultSellingPrice)}</Text>
              </View>
            </View>

            <TextInput
              mode="outlined"
              label="Selling Price (Rate)"
              value={rateInput}
              onChangeText={(val) => {
                setRateInput(val);
                const num = Number(val);
                if (isNaN(num) || num <= 0) {
                  setRateError("Please enter a valid price.");
                } else if (userRole === "STAFF" && num < minPrice) {
                  setRateError(`Staff cannot sell below minimum price of ${money(minPrice)}.`);
                } else {
                  setRateError(null);
                }
              }}
              keyboardType="numeric"
              style={styles.modalInput}
              outlineStyle={styles.inputOutline}
              left={<TextInput.Affix text="₹ " />}
              error={!!rateError}
            />
            {rateError ? (
              <Text style={styles.rateErrorText}>{rateError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                label="Reset"
                variant="ghost"
                onPress={() => {
                  setRateInput(String(item.defaultSellingPrice));
                  setRateError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowEditModal(false);
                  setRateInput(String(customRate ?? item.defaultSellingPrice));
                  setRateError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label="Save"
                variant="success"
                disabled={!!rateError || !rateInput}
                onPress={() => {
                  const num = Number(rateInput);
                  if (!isNaN(num) && num > 0) {
                    if (num === defaultPrice) {
                      onUpdateRate(undefined); // Reset to default
                    } else {
                      onUpdateRate(num);
                    }
                    setShowEditModal(false);
                  }
                }}
                style={{ flex: 1.5 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}, (p, n) => 
  p.item.id === n.item.id && 
  p.quantity === n.quantity && 
  p.customRate === n.customRate && 
  p.userRole === n.userRole &&
  p.serialNumbers?.join(",") === n.serialNumbers?.join(",")
);

export function WalkInSale() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const { activeShopId } = useShopStore();
  const network = useNetworkStatus();
  const shopsQuery = useShopsQuery();

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find(s => s.id === activeShopId), 
    [shopsQuery.data, activeShopId]
  );

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [cart, setCart] = useState<Record<string, { item: Item, quantity: number, customRate?: number, serialNumbers?: string[] }>>({});
  const [activeSerialScanItemId, setActiveSerialScanItemId] = useState<string | null>(null);
  
  const [completedSaleNumber, setCompletedSaleNumber] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Customer selection & search states
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDetailsExpanded, setCustomerDetailsExpanded] = useState(false);

  // Custom Walk-in Customer Info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");

  // Step 2 Settlement inputs
  const [amountReceived, setAmountReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [skuScannerVisible, setSkuScannerVisible] = useState(false);

  const itemsQuery = useItemsQuery({ search: debouncedSearch, limit: 50, enabled: !network.isOffline });
  const customersQuery = useCustomersQuery({ enabled: !network.isOffline });
  const mergedCustomers = useMemo(() => {
    return customersQuery.data ?? [];
  }, [customersQuery.data]);
  const displayItems = useMemo(() => {
    const items = !network.isOffline ? itemsQuery.data?.items ?? [] : [];
    return [...items].sort((a, b) => {
      const aSelected = (cart[a.id]?.quantity ?? 0) > 0;
      const bSelected = (cart[b.id]?.quantity ?? 0) > 0;
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });
  }, [itemsQuery.data, network.isOffline, cart]);

  const selectedCustomer = useMemo(() => 
    mergedCustomers.find((c: any) => c.id === customerId),
    [mergedCustomers, customerId]
  );

  const customerSummaryText = useMemo(() => {
    if (selectedCustomer) {
      return `Customer: ${selectedCustomer.name}`;
    }
    if (customerName.trim()) {
      return `Walk-in: ${customerName.trim()}`;
    }
    return "Default Walk-In (Anonymous)";
  }, [selectedCustomer, customerName]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    return mergedCustomers.filter((c: any) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch))
    ).slice(0, 5);
  }, [mergedCustomers, customerSearch]);

  const cartArray = useMemo(() => Object.values(cart), [cart]);
  const cartItemCount = useMemo(() => cartArray.reduce((sum, i) => sum + i.quantity, 0), [cartArray]);
  const cartTotal = useMemo(() => 
    cartArray.reduce((sum, i) => sum + (i.quantity * (i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice))), 0), 
    [cartArray]
  );

  const hasMissingPrice = useMemo(() => {
    return cartArray.some(i => {
      const rate = i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice || 0);
      return rate <= 0 || isNaN(rate);
    });
  }, [cartArray]);

  // Settlement Calculations
  const calculatedChange = useMemo(() => {
    const received = Number(amountReceived);
    if (isNaN(received) || received <= cartTotal) return 0;
    return received - cartTotal;
  }, [amountReceived, cartTotal]);

  const isPaymentValid = useMemo(() => {
    if (paymentMode === "UPI") return true;
    const received = Number(amountReceived);
    return !isNaN(received) && received >= cartTotal;
  }, [paymentMode, amountReceived, cartTotal]);

  const updateQuantity = useCallback((item: Item, delta: number) => {
    setCart(prev => {
      const current = prev[item.id] || { item, quantity: 0, serialNumbers: [] };
      const nextQty = Math.max(0, current.quantity + delta);
      
      const nextCart = { ...prev };
      if (nextQty === 0) {
        delete nextCart[item.id];
      } else {
        let serials = current.serialNumbers || [];
        if (serials.length > nextQty) {
          serials = serials.slice(0, nextQty);
        }
        nextCart[item.id] = { ...current, quantity: nextQty, serialNumbers: serials };
      }
      return nextCart;
    });
  }, []);

  const handleProductScanned = useCallback(async (sku: string) => {
    try {
      // 1. Search locally in displayItems
      let found = displayItems.find(i => i.sku === sku);

      // 2. If not found locally, fetch from backend
      if (!found) {
        const res = await fetchItems(token ?? "", activeShopId ?? "", { search: sku, limit: 1 });
        found = res.items?.find(i => i.sku === sku || i.name === sku);
      }

      if (found) {
        updateQuantity(found, 1);
        return { success: true, name: found.name };
      } else {
        return { success: false, name: "", msg: "Product not found" };
      }
    } catch (err: any) {
      return { success: false, name: "", msg: err.message || "Failed to lookup product" };
    }
  }, [displayItems, token, activeShopId, updateQuantity]);

  const saleMutation = useCreateSaleMutation();

  const isSerialsComplete = useMemo(() => {
    return cartArray.every(
      (i) => !i.item.requiresSerialNumber || (i.serialNumbers && i.serialNumbers.length === i.quantity)
    );
  }, [cartArray]);

  const handleCompleteSale = () => {
    if (saleMutation.isPending) return;
    if (network.isOffline) {
      Alert.alert("Internet required", internetRequiredMessage);
      return;
    }

    // Validate serial numbers before submitting
    for (const i of cartArray) {
      if (i.item.requiresSerialNumber) {
        if (!i.serialNumbers || i.serialNumbers.length !== i.quantity) {
          Alert.alert(
            "Serial Numbers Required",
            `Please scan all serial numbers for "${i.item.name}" before completing the sale.`
          );
          return;
        }
      }
    }

    saleMutation.mutate({
      items: cartArray.map(i => ({ 
        itemId: i.item.id, 
        quantity: i.quantity, 
        rate: i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice),
        serialNumbers: i.serialNumbers || [],
      })),
      isWalkin: !customerId,
      customerId: customerId || undefined,
      customerInfo: !customerId && (customerName || customerPhone) ? {
        name: customerName || undefined,
        phone: customerPhone || undefined,
      } : undefined,
      payments: [{
        paymentMode: paymentMode,
        amount: cartTotal
      }],
      notes: notes || undefined,
    }, {
      onSuccess: (res: any) => {
        setCompletedSale(res);
        setCompletedSaleNumber(res?.saleNumber || "N/A");
        setCurrentStep(3);
      },
      onError: (error: any) => {
        if (String(error?.message || "").toLowerCase().includes("network")) {
          Alert.alert("Internet required", internetRequiredMessage);
        } else {
          Alert.alert("Failed to Complete Sale", error?.message || "Something went wrong.");
        }
      }
    });
  };

  const handleHeaderBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate(user?.role === "OWNER" ? "OwnerDashboard" : "StaffWork");
      }
    }
  };

  const ProgressIndicator = ({ step }: { step: number }) => {
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressLineTrack}>
          <View style={styles.progressLine} />
          <View style={[styles.progressLineActive, { width: step === 2 ? '100%' : '0%' }]} />
        </View>
        
        <View style={styles.progressStepsRow}>
          {[1, 2].map((s) => {
            const isActive = s <= step;
            return (
              <View key={s} style={[
                styles.progressNode,
                isActive && styles.progressNodeActive
              ]}>
                {s === 1 && step > 1 ? (
                  <Icon source="check" size={14} color="#ffffff" />
                ) : (
                  <Text style={[
                    styles.progressNodeText,
                    isActive && styles.progressNodeTextActive
                  ]}>{s}</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const bottomPadding = insets.bottom > 0 ? insets.bottom + 12 : spacing.lg;
  const FlashListAny = FlashList as any;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {currentStep < 3 && (
          <>
            <AppHeader 
              title="Walk-in Sale" 
              subtitle={currentStep === 1 ? "Select items and customer info" : "Settle payment & complete"} 
              showBack={true} 
              onBack={handleHeaderBack}
            />
            <ProgressIndicator step={currentStep} />
          </>
        )}
        
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={[
            styles.scrollContent, 
            { paddingBottom: currentStep === 1 ? (cartItemCount > 0 ? 140 : 100) : 120 }
          ]}
        >
          {currentStep === 1 && (
            <View style={styles.stepContainer}>
              <Section title="Customer Details (Optional)">
                <Pressable
                  onPress={() => setCustomerDetailsExpanded(prev => !prev)}
                  style={styles.accordionHeader}
                >
                  <View style={styles.accordionLeft}>
                    <Icon source="account-outline" size={20} color={colors.textSecondary} />
                    <Text style={styles.accordionSummaryText}>{customerSummaryText}</Text>
                  </View>
                  <Icon 
                    source={customerDetailsExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color={colors.primary} 
                  />
                </Pressable>

                {customerDetailsExpanded && (
                  <View style={styles.formCard}>
                    {!selectedCustomer ? (
                      <>
                        <View style={styles.searchRow}>
                          <AppSearchBar
                            placeholder="Search existing customer..."
                            onChangeText={setCustomerSearch}
                            value={customerSearch}
                            style={{ flex: 1 }}
                          />
                          <Pressable 
                            onPress={() => navigation.navigate("AddEditCustomer")}
                            style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
                          >
                            <Icon source="account-plus" size={24} color={colors.primary} />
                          </Pressable>
                        </View>

                        {customerSearch && filteredCustomers.length === 0 ? (
                          <Pressable 
                            onPress={network.isOffline ? () => Alert.alert("Internet required", internetRequiredMessage) : () => navigation.navigate("AddEditCustomer", { customer: { name: customerSearch } })}
                            style={styles.addNewCustomerRow}
                          >
                            <Icon source="account-plus-outline" size={20} color={colors.primary} />
                            <Text style={styles.addNewCustomerText}>
                              No matches. Create "{customerSearch}"?
                            </Text>
                          </Pressable>
                        ) : null}

                        {customerSearch && filteredCustomers.length > 0 ? (
                          <View style={styles.searchDropdown}>
                            {filteredCustomers.map(c => (
                              <List.Item
                                key={c.id}
                                title={c.name}
                                description={c.phone || "No phone"}
                                onPress={() => { setCustomerId(c.id); setCustomerSearch(""); }}
                                right={props => <List.Icon {...props} icon="account-check-outline" color={colors.primary} />}
                              />
                            ))}
                          </View>
                        ) : null}

                        <View style={styles.orRow}>
                          <Divider style={styles.orDivider} />
                          <Text style={styles.orText}>OR QUICK WALK-IN DETAILS</Text>
                          <Divider style={styles.orDivider} />
                        </View>

                        <TextInput
                          mode="outlined"
                          label="Customer Name"
                          value={customerName}
                          onChangeText={setCustomerName}
                          style={styles.input}
                          outlineStyle={styles.inputOutline}
                          left={<TextInput.Icon icon="account-outline" />}
                        />
                        <TextInput
                          mode="outlined"
                          label="Mobile Number"
                          value={customerPhone}
                          onChangeText={setCustomerPhone}
                          keyboardType="phone-pad"
                          style={styles.input}
                          outlineStyle={styles.inputOutline}
                          left={<TextInput.Icon icon="phone-outline" />}
                        />
                      </>
                    ) : (
                      <View style={styles.selectedCustomerCard}>
                        <View style={styles.customerRow}>
                          <View style={styles.customerAvatar}>
                            <Text style={styles.customerAvatarText}>
                              {selectedCustomer.name[0].toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.customerNameText}>{selectedCustomer.name}</Text>
                            <Text style={styles.customerPhoneText}>{selectedCustomer.phone || "No phone"}</Text>
                          </View>
                        </View>
                        <Pressable 
                          onPress={() => setCustomerId(null)}
                          style={({ pressed }) => [styles.changeCustBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.changeCustText}>CHANGE</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </Section>

              {cartItemCount > 0 && (
                <Section title="Cart Items (Swipe right to edit price)">
                  <View style={[styles.listContainer, { marginBottom: spacing.md }]}>
                    {cartArray.map(({ item, quantity, customRate, serialNumbers }) => (
                      <CartItem
                        key={item.id}
                        item={item}
                        quantity={quantity}
                        customRate={customRate}
                        serialNumbers={serialNumbers}
                        onScanPress={() => setActiveSerialScanItemId(item.id)}
                        onUpdateRate={(rate) => {
                          setCart(prev => {
                            if (!prev[item.id]) return prev;
                            return {
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                customRate: rate
                              }
                            };
                          });
                        }}
                        onUpdateQuantity={(qty) => {
                          if (qty <= 0) {
                            setCart(prev => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                          } else {
                            updateQuantity(item, qty - (cart[item.id]?.quantity ?? 0));
                          }
                        }}
                        userRole={user?.role}
                      />
                    ))}
                  </View>
                </Section>
              )}

              <Section title="Select Items">
                <View style={styles.searchRow}>
                  <AppSearchBar
                    placeholder="Search name or SKU..."
                    onChangeText={setSearch}
                    value={search}
                    style={{ flex: 1 }}
                  />
                  <Pressable 
                    onPress={() => {
                      triggerLightHaptic();
                      setSkuScannerVisible(true);
                    }}
                    style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
                  >
                    <Icon source="barcode-scan" size={24} color={colors.primary} />
                  </Pressable>
                </View>
                
                <View style={styles.listContainer}>
                  <FlashListAny
                    data={displayItems}
                    keyExtractor={(item: Item) => item.id}
                    renderItem={({ item }: { item: Item }) => (
                      <SaleItemCard 
                        item={item} 
                        quantity={cart[item.id]?.quantity ?? 0}
                        serialNumbers={cart[item.id]?.serialNumbers}
                        onScanPress={() => setActiveSerialScanItemId(item.id)}
                        onAdd={() => updateQuantity(item, 1)}
                        onRemove={() => updateQuantity(item, -1)}
                      />
                    )}
                    ListEmptyComponent={
                      itemsQuery.isLoading && !network.isOffline ? (
                        <SkeletonList count={4} itemHeight={90} />
                      ) : network.isOffline ? (
                        <EmptyState
                          icon="cloud-off-outline"
                          title="Items unavailable offline"
                          subtitle="Open this shop online once to sync items."
                        />
                      ) : (
                        <EmptyState 
                          icon="magnify" 
                          title="No products found" 
                          subtitle="Try searching by name or SKU" 
                          action={
                            <Button 
                              label="Create Product" 
                              icon="plus" 
                              onPress={() => navigation.navigate("AddEditItem")}
                            />
                          }
                        />
                      )
                    }
                    scrollEnabled={false}
                  />
                </View>
              </Section>
            </View>
          )}

          {currentStep === 2 && (
            <View style={styles.stepContainer}>
              <Section title="Settle & Pay">
                {/* Total Due Premium Card */}
                <View style={styles.totalDueCard}>
                  <Text style={styles.totalDueLabel}>TOTAL DUE</Text>
                  <Text style={styles.totalDueVal}>{money(cartTotal)}</Text>
                  <View style={styles.totalDueFooter}>
                    <Icon source="information-outline" size={14} color={colors.primaryDark} />
                    <Text style={styles.totalDueFooterText}>
                      Walk-in sales require instant settlement
                    </Text>
                  </View>
                </View>

                {/* Custom Card Selection Grid */}
                <Text style={styles.paymentSectionLabel}>Select Payment Mode</Text>
                <View style={styles.paymentGrid}>
                  {(["CASH", "UPI"] as const).map((mode) => {
                    const isSelected = paymentMode === mode;
                    const label = mode === "CASH" ? "Cash" : "UPI";
                    const icon = mode === "CASH" ? "cash-multiple" : "qrcode-scan";
                    
                    return (
                      <Pressable 
                        key={mode}
                        onPress={() => {
                          setPaymentMode(mode);
                          if (mode === "UPI") {
                            setAmountReceived(String(cartTotal));
                          } else {
                            setAmountReceived("");
                          }
                        }}
                        style={({ pressed }) => [
                          styles.paymentCard,
                          isSelected && styles.paymentCardSelected,
                          pressed && styles.pressed
                        ]}
                      >
                        <View style={[
                          styles.paymentCardIconWrapper,
                          isSelected && styles.paymentCardIconWrapperActive
                        ]}>
                          <Icon 
                            source={icon} 
                            size={28} 
                            color={isSelected ? colors.primary : colors.textSecondary} 
                          />
                        </View>
                        <Text style={[
                          styles.paymentCardLabel, 
                          isSelected && styles.paymentCardLabelActive
                        ]}>
                          {label}
                        </Text>
                        {isSelected && (
                          <View style={styles.paymentCardCheck}>
                            <Icon source="check-circle" size={18} color={colors.primary} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Amount Received Input (Only for Cash) */}
                {paymentMode === "CASH" ? (
                  <View style={styles.cashCalculationContainer}>
                    <TextInput
                      mode="outlined"
                      label="Amount Received"
                      value={amountReceived}
                      onChangeText={setAmountReceived}
                      keyboardType="numeric"
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      placeholder={`Min ${money(cartTotal)}`}
                      left={<TextInput.Icon icon="cash" />}
                    />
                    
                    {amountReceived ? (
                      Number(amountReceived) < cartTotal ? (
                        <View style={[styles.calcInfoBox, styles.calcInfoBoxError]}>
                          <Icon source="alert-circle-outline" size={16} color={colors.danger} />
                          <Text style={styles.calcErrorText}>
                            Received amount cannot be less than total due.
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.calcInfoBox, styles.calcInfoBoxSuccess]}>
                          <Icon source="swap-horizontal" size={16} color={colors.success} />
                          <Text style={styles.calcSuccessText}>
                            Change to Return: <Text style={styles.boldText}>{money(calculatedChange)}</Text>
                          </Text>
                        </View>
                      )
                    ) : null}
                  </View>
                ) : (
                  <>
                    {selectedShop?.upiId ? (
                      <DynamicUpiQr 
                        upiId={selectedShop.upiId}
                        upiName={selectedShop.upiName || selectedShop.name}
                        amount={cartTotal}
                        transactionNote="Walk-In Sale"
                        size={180}
                      />
                    ) : (
                      <View style={[styles.calcInfoBox, styles.calcInfoBoxError, { width: "100%", marginTop: spacing.md }]}>
                        <Icon source="alert-circle-outline" size={20} color={colors.danger} />
                        <Text style={styles.calcErrorText}>
                          UPI is not configured for this shop. Go to Settings &gt; UPI Configuration to enable dynamic QR codes.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* Notes Input */}
                <View style={styles.notesContainer}>
                  <TextInput
                    mode="outlined"
                    label="Transaction Notes (Optional)"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                    style={styles.notesInput}
                    outlineStyle={styles.inputOutline}
                    placeholder="Add billing comments, product batch details etc."
                    left={<TextInput.Icon icon="note-text-outline" />}
                  />
                </View>
              </Section>
            </View>
          )}

          {currentStep === 3 && (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrapper}>
                <View style={styles.successPulseCircle}>
                  <Icon source="check-circle" size={80} color={colors.primary} />
                </View>
              </View>
              <Text style={styles.successTitle}>Sale Completed!</Text>
              <Text style={styles.successSubtitle}>
                {`Recorded walk-in sale of ${money(cartTotal)} successfully.`}
              </Text>
              
              {/* Receipt / Invoice Mock */}
              <View style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <Text style={styles.receiptShopName}>{selectedShop?.name ?? "Vardaman Sales"}</Text>
                  <Text style={styles.receiptMetaSub}>WALK-IN RECEIPT</Text>
                  <Text style={styles.receiptMetaDate}>
                    {new Date().toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <View style={styles.dashedDivider} />

                {/* Items List */}
                <View style={styles.receiptSection}>
                  <Text style={styles.receiptSectionTitle}>ITEMS</Text>
                  {cartArray.map(({ item, quantity }) => (
                    <View key={item.id} style={styles.receiptItemRow}>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={styles.receiptItemName}>{itemDisplayName(item)}</Text>
                        <Text style={styles.receiptItemSubText}>
                          {quantity} {item.unit} x {money(item.defaultSellingPrice)}
                        </Text>
                      </View>
                      <Text style={styles.receiptItemSubtotal}>{money(quantity * Number(item.defaultSellingPrice))}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.dashedDivider} />

                {/* Transaction Details */}
                <View style={styles.receiptSection}>
                  <InfoRow label="Sale Number" value={completedSaleNumber || "N/A"} />
                  <InfoRow label="Customer" value={customerId ? selectedCustomer?.name : (customerName || "Walk-in Customer")} />
                  {customerPhone ? (
                    <InfoRow label="Mobile" value={customerPhone} />
                  ) : null}
                  <InfoRow label="Payment Mode" value={paymentMode} />
                  {notes ? (
                    <View style={styles.receiptDetailRowCol}>
                      <Text style={styles.receiptDetailLabel}>Notes</Text>
                      <Text style={styles.receiptDetailValNotes}>{notes}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.dashedDivider} />

                {/* Payment Breakdown */}
                <View style={styles.receiptSection}>
                  <View style={[styles.receiptBreakdownRow, styles.receiptTotalRow]}>
                    <Text style={styles.receiptTotalLabel}>Total Amount</Text>
                    <Text style={styles.receiptTotalVal}>{money(cartTotal)}</Text>
                  </View>
                  {paymentMode === "CASH" && amountReceived ? (
                    <>
                      <InfoRow label="Amount Received" value={money(amountReceived)} />
                      <InfoRow label="Change Returned" value={money(calculatedChange)} tone="green" />
                    </>
                  ) : null}
                </View>

                {/* Receipt Footer */}
                <View style={styles.receiptFooter}>
                  <Text style={styles.receiptThankYou}>Thank you for your business!</Text>
                  <Text style={styles.receiptPowered}>Powered by ShopControl</Text>
                </View>
              </View>
              
              <View style={styles.successActionsContainer}>
                <Button
                  label="START NEW WALK-IN"
                  variant="success"
                  onPress={() => {
                    setCart({});
                    setCustomerId(null);
                    setCustomerSearch("");
                    setCustomerName("");
                    setCustomerPhone("");
                    setPaymentMode("CASH");
                    setAmountReceived("");
                    setNotes("");
                    setCompletedSaleNumber(null);
                    saleMutation.reset();
                    setCurrentStep(1);
                  }}
                  style={styles.newSaleBtn}
                />
                
                <View style={styles.receiptActionRow}>
                  <Button
                    label="View"
                    variant="ghost"
                    icon="eye-outline"
                    onPress={() => {
                      const finalSale = completedSale || {
                        saleNumber: completedSaleNumber || "N/A",
                        totalAmount: String(cartTotal),
                        paidAmount: String(cartTotal),
                        balanceAmount: "0",
                        isWalkin: !customerId,
                        createdAt: new Date().toISOString(),
                        items: cartArray.map(i => ({
                          id: i.item.id,
                          quantity: String(i.quantity),
                          rate: String(i.customRate !== undefined ? i.customRate : i.item.defaultSellingPrice),
                          totalAmount: String(i.quantity * (i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice))),
                          item: i.item,
                        })),
                        notes: notes || null,
                        payments: [{
                          paymentMode: paymentMode,
                          amount: String(cartTotal),
                          receivedAt: new Date().toISOString()
                        }]
                      };
                      navigation.navigate("InvoiceViewer", { sale: finalSale, shop: selectedShop });
                    }}
                    style={styles.receiptActionBtn}
                  />
                  <Button
                    label="Print"
                    variant="ghost"
                    icon="printer"
                    loading={isPrinting}
                    disabled={isSharing}
                    onPress={async () => {
                      setIsPrinting(true);
                      try {
                        await printSaleInvoiceDirect({
                          sale: completedSale || {
                            saleNumber: completedSaleNumber || "N/A",
                            totalAmount: String(cartTotal),
                            paidAmount: String(cartTotal),
                            balanceAmount: "0",
                            isWalkin: !customerId,
                            createdAt: new Date().toISOString(),
                            items: cartArray.map(i => ({
                              id: i.item.id,
                              quantity: String(i.quantity),
                              rate: String(i.customRate !== undefined ? i.customRate : i.item.defaultSellingPrice),
                              totalAmount: String(i.quantity * (i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice))),
                              item: i.item,
                            })),
                            notes: notes || null,
                            payments: [{
                              paymentMode: paymentMode,
                              amount: String(cartTotal),
                              receivedAt: new Date().toISOString()
                            }]
                          },
                          shop: selectedShop,
                        });
                      } finally {
                        setIsPrinting(false);
                      }
                    }}
                    style={styles.receiptActionBtn}
                  />
                  <Button
                    label="Share"
                    variant="ghost"
                    icon="share-variant"
                    loading={isSharing}
                    disabled={isPrinting}
                    onPress={async () => {
                      setIsSharing(true);
                      try {
                        await shareSaleInvoicePdf({
                          sale: completedSale || {
                            saleNumber: completedSaleNumber || "N/A",
                            totalAmount: String(cartTotal),
                            paidAmount: String(cartTotal),
                            balanceAmount: "0",
                            isWalkin: !customerId,
                            createdAt: new Date().toISOString(),
                            items: cartArray.map(i => ({
                              id: i.item.id,
                              quantity: String(i.quantity),
                              rate: String(i.customRate !== undefined ? i.customRate : i.item.defaultSellingPrice),
                              totalAmount: String(i.quantity * (i.customRate !== undefined ? i.customRate : Number(i.item.defaultSellingPrice))),
                              item: i.item,
                            })),
                            notes: notes || null,
                            payments: [{
                              paymentMode: paymentMode,
                              amount: String(cartTotal),
                              receivedAt: new Date().toISOString()
                            }]
                          },
                          shop: selectedShop,
                        });
                      } finally {
                        setIsSharing(false);
                      }
                    }}
                    style={styles.receiptActionBtn}
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Action Bottom Bars */}
        {currentStep === 1 && cartItemCount > 0 && (
          <View style={[styles.cartSummary, { paddingBottom: bottomPadding, flexDirection: "column", gap: spacing.xs }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <View style={styles.cartInfo}>
                <Text style={styles.cartCount}>{cartItemCount} items</Text>
                <Text style={styles.cartTotal}>{money(cartTotal)}</Text>
              </View>
              <Button 
                label="Proceed to Payment →" 
                variant="success"
                onPress={() => {
                  if (hasMissingPrice) {
                    Alert.alert("Invalid Price", "One or more items in the cart do not have a price set. Please swipe right on the item in the Cart list to edit the price.");
                    return;
                  }
                  setCurrentStep(2);
                  if (paymentMode === "UPI") {
                    setAmountReceived(String(cartTotal));
                  }
                }} 
                disabled={!isSerialsComplete}
                style={styles.checkoutButton}
              />
            </View>
            {!isSerialsComplete && (
              <Text style={{ color: colors.danger, fontSize: 11, alignSelf: "flex-end", fontWeight: "bold" }}>
                * Some items require serial scans
              </Text>
            )}
            {hasMissingPrice && !isSerialsComplete && (
              <Text style={{ color: colors.danger, fontSize: 11, alignSelf: "flex-end", fontWeight: "bold" }}>
                * Some items have missing prices (swipe to set)
              </Text>
            )}
          </View>
        )}

        {currentStep === 2 && (
          <View style={[styles.cartSummary, { paddingBottom: bottomPadding, gap: spacing.md }]}>
            <Button 
              label="← Back" 
              variant="ghost"
              onPress={() => setCurrentStep(1)} 
              style={{ flex: 1 }}
            />
            <Button 
              label="Complete Checkout" 
              variant="success"
              onPress={handleCompleteSale} 
              loading={saleMutation.isPending}
              disabled={!isPaymentValid || !isSerialsComplete}
              style={{ flex: 1.8 }}
            />
          </View>
        )}
      </KeyboardAvoidingView>
      {!!activeSerialScanItemId && !!cart[activeSerialScanItemId] && (
        <SerialNumberScannerModal
          visible={!!activeSerialScanItemId}
          itemName={cart[activeSerialScanItemId].item.name}
          quantity={cart[activeSerialScanItemId].quantity}
          serialNumbers={cart[activeSerialScanItemId].serialNumbers || []}
          onDismiss={() => setActiveSerialScanItemId(null)}
          onSave={(serials) => {
            setCart(prev => {
              if (!prev[activeSerialScanItemId]) return prev;
              return {
                ...prev,
                [activeSerialScanItemId]: {
                  ...prev[activeSerialScanItemId],
                  serialNumbers: serials
                }
              };
            });
            setActiveSerialScanItemId(null);
          }}
        />
      )}
      <ProductSkuScannerModal
        visible={skuScannerVisible}
        onProductScanned={handleProductScanned}
        onDismiss={() => setSkuScannerVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  serialStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  serialStatusSuccessText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: fontWeight.semibold,
  },
  serialStatusWarningText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  addNewCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
    marginTop: spacing.sm,
  },
  addNewCustomerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  listContainer: {
    minHeight: 200,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  itemCardActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderLeftWidth: 5,
    backgroundColor: colors.surface,
  },
  itemAvatarContainer: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  itemAvatarContainerActive: {
    backgroundColor: colors.primaryLight,
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stockBadgeLow: {
    backgroundColor: colors.warningLight,
  },
  stockTextLow: {
    color: colors.warning,
  },
  quantityControls: {
    minWidth: 120,
    alignItems: 'flex-end',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
    minWidth: 80,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addButtonLabel: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qtyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  qtyDisplay: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  disabledButton: {
    backgroundColor: colors.surfaceOffset,
  },
  disabledButtonLabel: {
    color: colors.textMuted,
  },
  disabledQtyButton: {
    backgroundColor: colors.surfaceOffset,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  outOfStockBadge: {
    backgroundColor: 'rgba(255, 74, 74, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  outOfStockText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  stockBadge: {
    backgroundColor: 'rgba(20, 163, 74, 0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  stockText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  cartSummary: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  },
  cartInfo: {
    flex: 1,
  },
  cartCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  cartTotal: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  checkoutButton: {
    flex: 1.5,
  },
  stepContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  paymentGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  paymentCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    position: 'relative',
    ...shadow.sm,
  },
  paymentCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  paymentCardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCardIconWrapperActive: {
    backgroundColor: 'white',
  },
  paymentCardLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  paymentCardLabelActive: {
    color: colors.primaryDark,
    fontWeight: fontWeight.extrabold,
  },
  paymentCardCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  totalDueCard: {
    backgroundColor: colors.primaryLight,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  totalDueLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  totalDueVal: {
    fontSize: 36,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  totalDueFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  totalDueFooterText: {
    fontSize: 11,
    color: colors.primaryDark,
    opacity: 0.8,
    fontWeight: fontWeight.medium,
  },
  paymentSectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  cashCalculationContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  calcInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  calcInfoBoxError: {
    backgroundColor: 'rgba(255, 74, 74, 0.08)',
    borderColor: 'rgba(255, 74, 74, 0.2)',
  },
  calcInfoBoxSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  calcErrorText: {
    fontSize: fontSize.sm,
    color: colors.danger,
    fontWeight: fontWeight.medium,
  },
  calcSuccessText: {
    fontSize: fontSize.sm,
    color: colors.primaryDark,
    fontWeight: fontWeight.medium,
  },
  boldText: {
    fontWeight: fontWeight.black,
  },
  upiDisclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  upiDisclaimerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  notesContainer: {
    marginBottom: spacing.lg,
  },
  notesInput: {
    backgroundColor: colors.surface,
  },
  successContainer: {
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.bg,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  accordionSummaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  successIconWrapper: {
    marginBottom: spacing.lg,
  },
  successPulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xxxl,
    ...shadow.md,
  },
  receiptHeader: {
    alignItems: 'center',
    gap: 2,
  },
  receiptShopName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  receiptMetaSub: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  receiptMetaDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  dashedDivider: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginVertical: spacing.md,
    height: 0,
  },
  receiptSection: {
    gap: spacing.sm,
  },
  receiptSectionTitle: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptItemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptItemSubText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  receiptItemSubtotal: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptDetailRowCol: {
    flexDirection: 'column',
    gap: 4,
    marginTop: 4,
  },
  receiptDetailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  receiptDetailValNotes: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceOffset,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
  },
  receiptBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptTotalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  receiptTotalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  receiptTotalVal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.primaryDark,
  },
  receiptFooter: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  receiptThankYou: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  receiptPowered: {
    fontSize: 10,
    color: colors.textMuted,
  },
  successActionsContainer: {
    width: '100%',
    gap: spacing.md,
  },
  newSaleBtn: {
    width: '100%',
  },
  receiptActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  receiptActionBtn: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  searchAddBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchDropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    ...shadow.sm,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  orDivider: {
    flex: 1,
    backgroundColor: colors.border,
  },
  orText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  selectedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    color: 'white',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  customerNameText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.primaryDark,
  },
  customerPhoneText: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    opacity: 0.8,
  },
  changeCustBtn: {
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
  },
  changeCustText: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
  // Progress Indicator Styles
  progressContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  progressLineTrack: {
    position: 'absolute',
    top: spacing.md + 14,
    left: spacing.lg + 24,
    right: spacing.lg + 24,
    height: 3,
    backgroundColor: colors.surfaceOffset,
    zIndex: 1,
  },
  progressLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.border,
  },
  progressLineActive: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
  progressStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    zIndex: 2,
    paddingHorizontal: 12,
  },
  progressNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  progressNodeActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  progressNodeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  progressNodeTextActive: {
    color: '#ffffff',
  },
  upiQrSection: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  upiQrText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  upiQrSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#10b981', // Green background underlay
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  swipeUnderlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 100,
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  swipeUnderlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  swipeUnderlayText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: fontWeight.bold,
  },
  cartReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  cartItemLeft: {
    flex: 1.5,
    marginRight: spacing.sm,
  },
  cartItemName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartItemPrice: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cartItemRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cartItemSubtotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalItemName: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  pricingDetailsGrid: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  pricingGridCell: {
    alignItems: 'center',
    flex: 1,
  },
  pricingGridLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  pricingGridValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  modalInput: {
    backgroundColor: colors.surface,
  },
  rateErrorText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  helperWarning: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.danger,
    textAlign: 'center',
  },
});
