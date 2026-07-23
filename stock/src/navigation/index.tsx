import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { ComponentType } from "react";
import { createStaticNavigation } from "@react-navigation/native";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Pressable, useWindowDimensions, StyleSheet, Platform, Text } from "react-native";
import { Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../auth/auth-store";
import { AssignStaff } from "./screens/AssignStaff";
import { CashClosingReview } from "./screens/CashClosingReview";
import { CloseDay } from "./screens/CloseDay";
import { CreateEditShop } from "./screens/CreateEditShop";
import { DailySummary } from "./screens/DailySummary";
import { Home } from "./screens/Home";
import { NotFound } from "./screens/NotFound";
import { OpenCashSession } from "./screens/OpenCashSession";
import { OrdersToPack } from "./screens/OrdersToPack";
import { PaymentVerification } from "./screens/PaymentVerification";
import { AddEditCustomer, CustomerList } from "./screens/OwnerCustomers";
import { CustomerDetail } from "./screens/CustomerDetail";
import { ExpenseList } from "./screens/Expenses";
import { VerificationQueue } from "./screens/VerificationQueue";
import { AddEditItem } from "./screens/items/AddEditItem";
import { ItemDetail } from "./screens/items/ItemDetail";
import { ItemList } from "./screens/items/ItemList";
import { StorageManagement } from "./screens/StorageManagement";
import { SalesListScreen as SalesList } from "../features/sales/history/screens/SalesListScreen";
import { SaleDetailScreen as SaleDetail } from "../features/sales/history/screens/SaleDetailScreen";
import { EditSale } from "./screens/EditSale";
import { AddEditStaff, StaffManagement, StaffDetail } from "./screens/OwnerStaff";
import {
  GenericPlannedScreen,
  OwnerRecords,
  OwnerStock,
} from "./screens/PlannedScreens";
import { ChequeList } from "./screens/ChequeList";
import { ChequeDetail } from "./screens/ChequeDetail";
import { NewSaleType } from "./screens/NewSaleType";
import { RegularSaleScreen as RegularSale } from "../features/sales/create/regular/RegularSaleScreen";
import { Notifications } from "./screens/Notifications";
import { StaffWork } from "./screens/StaffWork";
import { Profile } from "./screens/Profile";
import { SetOpeningStock } from "./screens/SetOpeningStock";
import { Settings } from "./screens/Settings";
import { StockEntry } from "./screens/StockEntry";
import { TakePayment } from "./screens/TakePayment";
import { Updates } from "./screens/Updates";
import { UpiConfig } from "./screens/UpiConfig";
import { WalkInSaleScreen as WalkInSale } from "../features/sales/create/walk-in/WalkInSaleScreen";
import { InvoiceViewer } from "./screens/InvoiceViewer";
import { CreateOrder } from "./screens/CreateOrder";
import { OrderList } from "./screens/OrderList";
import { OrderDetail } from "./screens/OrderDetail";
import { StockDashboard } from "./screens/StockDashboard";
import { DailySummaryList } from "./screens/DailySummaryList";
import { StockMovementHistory } from "./screens/StockMovementHistory";
import { DeliveryMemoList } from "./screens/DeliveryMemoList";
import { CreateDeliveryMemo } from "./screens/CreateDeliveryMemo";
import { DeliveryMemoDetail } from "./screens/DeliveryMemoDetail";
import { ManageCategories } from "./screens/ManageCategories";
import { ManageBrands } from "./screens/ManageBrands";
import { CopyCatalog } from "./screens/CopyCatalog";
import { ChatListScreen } from "../modules/whatsapp/screens/ChatListScreen";
import { ChatDetailScreen } from "../modules/whatsapp/screens/ChatDetailScreen";
import { ContactBookScreen } from "../modules/whatsapp/screens/ContactBookScreen";
import { TemplateLibraryScreen } from "../modules/whatsapp/screens/TemplateLibraryScreen";
import { TemplateEditorScreen } from "../modules/whatsapp/screens/TemplateEditorScreen";
import { FlowLibraryScreen } from "../modules/whatsapp/screens/FlowLibraryScreen";
import { FlowEditorScreen } from "../modules/whatsapp/screens/FlowEditorScreen";
import { WhatsAppSetupScreen } from "../modules/whatsapp/screens/WhatsAppSetupScreen";
import { whatsappCapabilityScreen } from "../modules/whatsapp/WhatsAppFeatureGate";
// import { colors } from "../theme";

import { shadow } from "../theme";
import { triggerLightHaptic } from "../utils/haptics";

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarContainer, { bottom: Math.max(insets.bottom, 16) }]}
    >
      <View style={[styles.tabBarPill, { width: Math.min(width - 32, 360) }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              triggerLightHaptic();
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          let iconName = "help-circle-outline";
          if (route.name === "StaffHome" || route.name === "OwnerDashboard") {
            iconName = isFocused ? "view-dashboard" : "view-dashboard-outline";
          } else if (route.name === "StaffWork") {
            iconName = isFocused ? "clipboard-list" : "clipboard-list-outline";
          } else if (route.name === "OwnerRecords") {
            iconName = isFocused ? "folder-table" : "folder-table-outline";
          } else if (route.name === "OwnerStock") {
            iconName = isFocused ? "warehouse" : "warehouse";
          } else if (route.name === "StaffPayments") {
            iconName = isFocused ? "cash-register" : "cash-register";
          } else if (route.name === "WhatsApp") {
            iconName = isFocused ? "whatsapp" : "whatsapp";
          } else if (route.name === "Profile") {
            iconName = isFocused ? "account-circle" : "account-circle-outline";
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={8}
              style={styles.tabButton}
            >
              <View style={[
                styles.iconContainer,
                isFocused ? styles.iconContainerActive : undefined
              ].filter(Boolean) as any}>
                <Icon
                  source={iconName}
                  color={isFocused ? "#ffffff" : "#475569"}
                  size={22}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    elevation: 8,
  },
  tabBarPill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 32,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 360,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    ...shadow.lg,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconContainerActive: {
    backgroundColor: '#111827',
    ...Platform.select({
      ios: {
        transform: [{ scale: 1.08 }],
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        // Flat styling on Android avoids OS elevation bugs drawing a square shadow
      },
    }),
  },
  accessDenied: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  accessDeniedTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  accessDeniedText: {
    marginTop: 6,
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
});

const floatingTabOptions = {
  headerShown: false,
  tabBarHideOnKeyboard: true,
};

const WhatsAppChats = whatsappCapabilityScreen(ChatListScreen);
const WhatsAppChatDetail = whatsappCapabilityScreen(ChatDetailScreen);
const WhatsAppContacts = whatsappCapabilityScreen(ContactBookScreen);
const WhatsAppTemplates = whatsappCapabilityScreen(TemplateLibraryScreen);
const WhatsAppTemplateEditor = whatsappCapabilityScreen(TemplateEditorScreen);
const WhatsAppFlows = whatsappCapabilityScreen(FlowLibraryScreen);
const WhatsAppFlowEditor = whatsappCapabilityScreen(FlowEditorScreen);
const WhatsAppSetup = whatsappCapabilityScreen(WhatsAppSetupScreen);

function AccessDeniedScreen() {
  return (
    <View style={styles.accessDenied}>
      <Icon source="lock-outline" size={40} color="#64748b" />
      <Text style={styles.accessDeniedTitle}>Access denied</Text>
      <Text style={styles.accessDeniedText}>This screen is available to owners only.</Text>
    </View>
  );
}

function ownerOnlyScreen<TProps extends object>(Component: ComponentType<TProps>) {
  return function OwnerOnlyScreen(props: TProps) {
    const role = useAuthStore((state) => state.user?.role);
    if (role !== "OWNER") return <AccessDeniedScreen />;
    return <Component {...props} />;
  };
}

const StaffTabs = createBottomTabNavigator({
  tabBar: (props) => <CustomTabBar {...props} />,
  screenOptions: floatingTabOptions,
  screens: {
    StaffHome: {
      screen: Home,
      options: {
        title: "Home",
      },
    },
    StaffWork: {
      screen: StaffWork,
      options: {
        title: "Work",
      },
    },
    StaffPayments: {
      screen: TakePayment,
      options: {
        title: "POS",
      },
    },
    WhatsApp: {
      screen: WhatsAppChats,
      options: {
        title: "WhatsApp",
      },
    },
    Profile: {
      screen: Profile,
      options: {
        title: "Profile",
      },
    },
  },
});

const OwnerTabs = createBottomTabNavigator({
  tabBar: (props) => <CustomTabBar {...props} />,
  screenOptions: floatingTabOptions,
  screens: {
    OwnerDashboard: {
      screen: Home,
      options: {
        title: "Dashboard",
      },
    },
    OwnerRecords: {
      screen: OwnerRecords,
      options: {
        title: "Records",
      },
    },
    OwnerStock: {
      screen: OwnerStock,
      options: {
        title: "Stock",
      },
    },
    WhatsApp: {
      screen: WhatsAppChats,
      options: {
        title: "WhatsApp",
      },
    },
    Profile: {
      screen: Profile,
      options: {
        title: "Profile",
      },
    },
  },
});

const sharedStackScreens = {
  WhatsAppChats: {
    screen: WhatsAppChats,
    options: { title: "WhatsApp" },
    linking: { path: "shops/:shopId/whatsapp/:integrationId" },
  },
  ChatDetail: {
    screen: WhatsAppChatDetail,
    options: { title: "Conversation" },
    linking: { path: "shops/:shopId/whatsapp/:integrationId/conversations/:conversationId" },
  },
  ContactBook: {
    screen: WhatsAppContacts,
    options: { title: "WhatsApp contacts" },
  },
  TemplateLibrary: {
    screen: WhatsAppTemplates,
    options: { title: "WhatsApp templates" },
  },
  TemplateEditor: {
    screen: WhatsAppTemplateEditor,
    options: { title: "Template editor" },
  },
  FlowLibrary: {
    screen: WhatsAppFlows,
    options: { title: "WhatsApp Flows" },
  },
  FlowEditor: {
    screen: WhatsAppFlowEditor,
    options: { title: "Flow editor" },
  },
  WhatsAppSetup: {
    screen: WhatsAppSetup,
    options: { title: "WhatsApp settings" },
  },
  EditSale: {
    screen: EditSale,
    options: { title: "Edit Sale Workspace" },
  },
  NotFound: {
    screen: NotFound,
    options: { title: "404" },
    linking: { path: "*" },
  },
  NotificationHistory: {
    screen: Notifications,
    options: { title: "Notifications" },
  },
  WalkInSale: {
    screen: WalkInSale,
    options: { title: "Walk-in sale" },
  },
  NewSaleType: {
    screen: NewSaleType,
    options: { title: "New sale" },
  },
  RegularSale: {
    screen: RegularSale,
    options: { title: "Regular sale" },
  },
  InvoiceViewer: {
    screen: InvoiceViewer,
    options: { title: "Invoice Preview" },
  },
  SplitPayment: {
    screen: GenericPlannedScreen,
    options: { title: "Split payment" },
  },
  OpenCashSession: {
    screen: OpenCashSession,
    options: { title: "Open cash session" },
  },
  StockEntry: {
    screen: StockEntry,
    options: { title: "Stock entry" },
  },
  StockMovementHistory: {
    screen: StockMovementHistory,
    options: { title: "Stock movement history" },
  },
  OrdersToPack: {
    screen: OrdersToPack,
    options: { title: "Orders to pack" },
  },
  OrderDetail: {
    screen: OrderDetail,
    options: { title: "Order detail" },
  },
  Packing: {
    screen: GenericPlannedScreen,
    options: { title: "Packing" },
  },
  Dispatch: {
    screen: GenericPlannedScreen,
    options: { title: "Dispatch" },
  },
  CloseDay: {
    screen: CloseDay,
    options: { title: "Close day" },
  },
  TodaySummary: {
    screen: ownerOnlyScreen(DailySummary),
    options: { title: "Today summary" },
  },
  Expenses: {
    screen: ExpenseList,
    options: { title: "Expenses" },
  },
  VerificationQueue: {
    screen: ownerOnlyScreen(VerificationQueue),
    options: { title: "Verification Queue" },
  },
  CreateDeliveryMemo: {
    screen: CreateDeliveryMemo,
    options: { title: "Create delivery memo" },
  },
  DeliveryMemoList: {
    screen: DeliveryMemoList,
    options: { title: "Delivery memos" },
  },
  DeliveryMemoDetail: {
    screen: DeliveryMemoDetail,
    options: { title: "Delivery memo detail" },
  },
  TakePayment: {
    screen: TakePayment,
    options: { title: "Take payment" },
  },
  RequestCorrection: {
    screen: GenericPlannedScreen,
    options: { title: "Request correction" },
  },
  RequestRateChange: {
    screen: GenericPlannedScreen,
    options: { title: "Request rate change" },
  },
  CreateEditShop: {
    screen: ownerOnlyScreen(CreateEditShop),
    options: { title: "Manage shop" },
  },
  AssignStaff: {
    screen: ownerOnlyScreen(AssignStaff),
    options: { title: "Assign staff" },
  },
  SetOpeningStock: {
    screen: ownerOnlyScreen(SetOpeningStock),
    options: { title: "Set opening stock" },
  },
  PaymentVerification: {
    screen: ownerOnlyScreen(PaymentVerification),
    options: { title: "Verify payments" },
  },
  CashClosingReview: {
    screen: ownerOnlyScreen(CashClosingReview),
    options: { title: "Cash closing review" },
  },
  DailySummary: {
    screen: ownerOnlyScreen(DailySummary),
    options: { title: "Daily summary" },
  },
  UpiConfig: {
    screen: ownerOnlyScreen(UpiConfig),
    options: { title: "UPI configuration" },
  },
  Updates: {
    screen: ownerOnlyScreen(Updates),
    options: { title: "Shops" },
  },
  CreateOrder: {
    screen: CreateOrder,
    options: { title: "Create order" },
  },
  OrderList: {
    screen: OrderList,
    options: { title: "Orders" },
  },
  RateChangeRequests: {
    screen: GenericPlannedScreen,
    options: { title: "Rate change requests" },
  },
  PriceHistory: {
    screen: GenericPlannedScreen,
    options: { title: "Price history" },
  },
  SalesList: {
    screen: SalesList,
    options: { title: "Sales" },
  },
  SaleDetail: {
    screen: SaleDetail,
    options: { title: "Sale detail" },
  },
  ChequeList: {
    screen: ChequeList,
    options: { title: "Cheques" },
  },
  ChequeDetail: {
    screen: ChequeDetail,
    options: { title: "Cheque detail" },
  },
  CustomerList: {
    screen: CustomerList,
    options: { title: "Customers" },
  },
  AddEditCustomer: {
    screen: AddEditCustomer,
    options: { title: "Add/edit customer" },
  },
  CustomerDetail: {
    screen: CustomerDetail,
    options: { title: "Customer detail" },
  },
  CustomerOutstandingList: {
    screen: GenericPlannedScreen,
    options: { title: "Customer outstanding" },
  },
  ItemList: {
    screen: ItemList,
    options: { title: "Items" },
  },
  AddEditItem: {
    screen: ownerOnlyScreen(AddEditItem),
    options: { title: "Add/edit item" },
  },
  ItemDetail: {
    screen: ItemDetail,
    options: { title: "Item detail" },
  },
  StorageManagement: {
    screen: ownerOnlyScreen(StorageManagement),
    options: { title: "S3 Storage Management" },
  },
  StockDashboard: {
    screen: StockDashboard,
    options: { title: "Stock dashboard" },
  },
  CashSessionDetail: {
    screen: GenericPlannedScreen,
    options: { title: "Cash session detail" },
  },
  CorrectionRequests: {
    screen: GenericPlannedScreen,
    options: { title: "Correction requests" },
  },
  DailySummaryList: {
    screen: ownerOnlyScreen(DailySummaryList),
    options: { title: "Daily summaries" },
  },
  StaffManagement: {
    screen: ownerOnlyScreen(StaffManagement),
    options: { title: "Staff management" },
  },
  AddEditStaff: {
    screen: ownerOnlyScreen(AddEditStaff),
    options: { title: "Add/edit staff" },
  },
  StaffDetail: {
    screen: ownerOnlyScreen(StaffDetail),
    options: { title: "Staff details" },
  },
  AuditLog: {
    screen: ownerOnlyScreen(GenericPlannedScreen),
    options: { title: "Audit log" },
  },
  Settings: {
    screen: Settings,
    options: { title: "Settings" },
  },
  ManageCategories: {
    screen: ownerOnlyScreen(ManageCategories),
    options: { title: "Manage categories" },
  },
  ManageBrands: {
    screen: ownerOnlyScreen(ManageBrands),
    options: { title: "Manage brands" },
  },
  CopyCatalog: {
    screen: ownerOnlyScreen(CopyCatalog),
    options: { title: "Copy Catalog" },
  },
};

const StaffRootStack = createNativeStackNavigator({
  initialRouteName: "StaffTabs",
  screenOptions: {
    headerShown: false,
  },
  screens: {
    StaffTabs: {
      screen: StaffTabs,
      options: {
        title: "Staff",
      },
    },
    ...sharedStackScreens,
  },
});

const OwnerRootStack = createNativeStackNavigator({
  initialRouteName: "OwnerTabs",
  screenOptions: {
    headerShown: false,
  },
  screens: {
    OwnerTabs: {
      screen: OwnerTabs,
      options: {
        title: "Owner",
      },
    },
    ...sharedStackScreens,
  },
});

export type StaffTabParamList = {
  StaffHome: undefined;
  StaffWork: undefined;
  StaffPayments: undefined;
  WhatsApp: undefined;
  Profile: undefined;
};

export type OwnerTabParamList = {
  OwnerDashboard: undefined;
  OwnerRecords: undefined;
  OwnerStock: undefined;
  WhatsApp: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  // Tabs
  StaffTabs: NavigatorScreenParams<StaffTabParamList>;
  OwnerTabs: NavigatorScreenParams<OwnerTabParamList>;

  // Shared Stack Screens
  NotFound: undefined;
  NotificationHistory: undefined;
  WalkInSale: undefined;
  NewSaleType: undefined;
  RegularSale: undefined;
  SplitPayment: undefined;
  OpenCashSession: undefined;
  StockEntry: { itemId?: string };
  StockMovementHistory: undefined;
  OrdersToPack: { initialTab?: string };
  OrderDetail: { orderId: string };
  Packing: undefined;
  Dispatch: undefined;
  CloseDay: undefined;
  TodaySummary: undefined;
  Expenses: undefined;
  VerificationQueue: undefined;
  CreateDeliveryMemo: undefined;
  DeliveryMemoList: undefined;
  DeliveryMemoDetail: { id: string };
  TakePayment: { customerId?: string; customer?: any; orderId?: string; dmId?: string; amount?: number; saleId?: string };
  RequestCorrection: undefined;
  RequestRateChange: undefined;
  CreateEditShop: { shop?: any };
  AssignStaff: { shop: any };
  SetOpeningStock: { shop?: any };
  PaymentVerification: undefined;
  CashClosingReview: undefined;
  DailySummary: { id?: string; date?: string };
  UpiConfig: {
    shop?: {
      id: string;
      name: string;
      upiId?: string | null;
      upiName?: string | null;
    };
  } | undefined;
  Updates: undefined;
  CreateOrder: undefined;
  OrderList: undefined;
  RateChangeRequests: undefined;
  PriceHistory: undefined;
  SalesList: { filter?: string };
  SaleDetail: { id: string };
  EditSale: { saleId: string };
  InvoiceViewer: { sale: any; shop?: any };
  ChequeList: undefined;
  ChequeDetail: { chequeId: string };
  CustomerList: undefined;
  AddEditCustomer: { customer?: any } | undefined;
  CustomerDetail: { customerId: string };
  CustomerOutstandingList: undefined;
  ItemList: { brandId?: string; categoryId?: string } | undefined;
  AddEditItem: { itemId?: string; initialName?: string } | undefined;
  ItemDetail: { itemId: string };
  StorageManagement: undefined;
  StockDashboard: undefined;
  CashSessionDetail: undefined;
  CorrectionRequests: undefined;
  DailySummaryList: undefined;
  StaffManagement: undefined;
  AddEditStaff: { staff?: any };
  StaffDetail: { staff: any };
  AuditLog: undefined;
  Settings: undefined;
  Home: undefined;
  ManageCategories: undefined;
  ManageBrands: undefined;
  CopyCatalog: undefined;
  WhatsAppChats: { shopId?: string; integrationId?: string };
  ChatDetail: {
    shopId?: string;
    integrationId?: string;
    phoneNumberId?: string;
    conversationId: string;
    phone?: string;
    messageId?: string;
    eventId?: string;
  };
  ContactBook: { shopId?: string; integrationId?: string } | undefined;
  TemplateLibrary: { shopId?: string; integrationId?: string } | undefined;
  TemplateEditor: { shopId?: string; integrationId?: string; templateId?: string } | undefined;
  FlowLibrary: { shopId?: string; integrationId?: string } | undefined;
  FlowEditor: { shopId?: string; integrationId?: string; flowId?: string } | undefined;
  WhatsAppSetup: { shopId?: string; integrationId?: string } | undefined;
};

export type StaffStackParamList = RootStackParamList;
export type OwnerStackParamList = RootStackParamList;

export const StaffNavigation = createStaticNavigation(StaffRootStack);
export const OwnerNavigation = createStaticNavigation(OwnerRootStack);

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
