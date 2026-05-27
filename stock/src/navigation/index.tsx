import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { Icon } from "react-native-paper";
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
import { AddEditCustomer, CustomerDetail, CustomerList } from "./screens/OwnerCustomers";
import { AddEditItem, ItemDetail, ItemList } from "./screens/OwnerItems";
import { SaleDetail, SalesList } from "./screens/OwnerSales";
import { AddEditStaff, StaffManagement } from "./screens/OwnerStaff";
import {
  GenericPlannedScreen,
  NewSaleType,
  Notifications,
  OwnerAlerts,
  OwnerRecords,
  OwnerStock,
  StaffWork,
} from "./screens/PlannedScreens";
import { Profile } from "./screens/Profile";
import { SetOpeningStock } from "./screens/SetOpeningStock";
import { Settings } from "./screens/Settings";
import { StockEntry } from "./screens/StockEntry";
import { TakePayment } from "./screens/TakePayment";
import { Updates } from "./screens/Updates";
import { UpiConfig } from "./screens/UpiConfig";
import { WalkInSale } from "./screens/WalkInSale";
import { CreateOrder } from "./screens/CreateOrder";

const tabIcon = (source: string) => ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
  <View
    style={{
      width: 48,
      height: 36,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: focused ? "#dbeafe" : "transparent",
    }}
  >
    <Icon source={source} color={focused ? "#1e40af" : color} size={size} />
  </View>
);

const floatingTabOptions = {
  headerShown: false,
  tabBarActiveTintColor: "#1e40af",
  tabBarInactiveTintColor: "#6b7280",
  tabBarLabelStyle: {
    fontSize: 10,
    fontWeight: "700" as const,
    marginTop: 0,
    paddingBottom: 2,
  },
  tabBarStyle: {
    position: "absolute" as const,
    left: 24,
    right: 24,
    bottom: 18,
    height: 72,
    paddingTop: 8,
    paddingBottom: 10,
    borderRadius: 34,
    backgroundColor: "#ffffff",
    borderTopWidth: 0,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 12,
  },
};

const StaffTabs = createBottomTabNavigator({
  screenOptions: floatingTabOptions,
  screens: {
    StaffHome: {
      screen: Home,
      options: {
        title: "Home",
        tabBarIcon: tabIcon("view-dashboard-outline"),
      },
    },
    StaffWork: {
      screen: StaffWork,
      options: {
        title: "Work",
        tabBarIcon: tabIcon("clipboard-list-outline"),
      },
    },
    StaffPayments: {
      screen: Settings,
      options: {
        title: "DMs/Pay",
        tabBarIcon: tabIcon("cash-register"),
      },
    },
    Notifications: {
      screen: Notifications,
      options: {
        title: "Alerts",
        tabBarIcon: tabIcon("bell-outline"),
      },
    },
    Profile: {
      screen: Profile,
      options: {
        tabBarIcon: tabIcon("account-circle-outline"),
      },
    },
  },
});

const OwnerTabs = createBottomTabNavigator({
  screenOptions: floatingTabOptions,
  screens: {
    OwnerDashboard: {
      screen: Home,
      options: {
        title: "Dashboard",
        tabBarIcon: tabIcon("view-dashboard-outline"),
      },
    },
    OwnerRecords: {
      screen: OwnerRecords,
      options: {
        title: "Records",
        tabBarIcon: tabIcon("folder-table-outline"),
      },
    },
    OwnerStock: {
      screen: OwnerStock,
      options: {
        title: "Stock",
        tabBarIcon: tabIcon("warehouse"),
      },
    },
    OwnerAlerts: {
      screen: OwnerAlerts,
      options: {
        title: "Alerts",
        tabBarIcon: tabIcon("bell-alert-outline"),
      },
    },
    Profile: {
      screen: Profile,
      options: {
        tabBarIcon: tabIcon("account-circle-outline"),
      },
    },
  },
});

const sharedStackScreens = {
  NotFound: {
    screen: NotFound,
    options: { title: "404" },
    linking: { path: "*" },
  },
  Notifications: {
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
    screen: GenericPlannedScreen,
    options: { title: "Regular sale" },
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
    screen: GenericPlannedScreen,
    options: { title: "Stock movement history" },
  },
  OrdersToPack: {
    screen: OrdersToPack,
    options: { title: "Orders to pack" },
  },
  OrderDetail: {
    screen: GenericPlannedScreen,
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
    screen: DailySummary,
    options: { title: "Today summary" },
  },
  CreateDeliveryMemo: {
    screen: GenericPlannedScreen,
    options: { title: "Create delivery memo" },
  },
  DeliveryMemoList: {
    screen: GenericPlannedScreen,
    options: { title: "Delivery memos" },
  },
  DeliveryMemoDetail: {
    screen: GenericPlannedScreen,
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
    screen: CreateEditShop,
    options: { title: "Manage shop" },
  },
  AssignStaff: {
    screen: AssignStaff,
    options: { title: "Assign staff" },
  },
  SetOpeningStock: {
    screen: SetOpeningStock,
    options: { title: "Set opening stock" },
  },
  PaymentVerification: {
    screen: PaymentVerification,
    options: { title: "Verify payments" },
  },
  CashClosingReview: {
    screen: CashClosingReview,
    options: { title: "Cash closing review" },
  },
  DailySummary: {
    screen: DailySummary,
    options: { title: "Daily summary" },
  },
  UpiConfig: {
    screen: UpiConfig,
    options: { title: "UPI configuration" },
  },
  Updates: {
    screen: Updates,
    options: { title: "Shops" },
  },
  CreateOrder: {
    screen: CreateOrder,
    options: { title: "Create order" },
  },
  OrderList: {
    screen: GenericPlannedScreen,
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
    screen: GenericPlannedScreen,
    options: { title: "Cheques" },
  },
  ChequeDetail: {
    screen: GenericPlannedScreen,
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
    screen: AddEditItem,
    options: { title: "Add/edit item" },
  },
  ItemDetail: {
    screen: ItemDetail,
    options: { title: "Item detail" },
  },
  StockDashboard: {
    screen: GenericPlannedScreen,
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
    screen: GenericPlannedScreen,
    options: { title: "Daily summaries" },
  },
  StaffManagement: {
    screen: StaffManagement,
    options: { title: "Staff management" },
  },
  AddEditStaff: {
    screen: AddEditStaff,
    options: { title: "Add/edit staff" },
  },
  AuditLog: {
    screen: GenericPlannedScreen,
    options: { title: "Audit log" },
  },
  Settings: {
    screen: Settings,
    options: { title: "Settings" },
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
      options: { title: "Staff" },
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
      options: { title: "Owner" },
    },
    ...sharedStackScreens,
  },
});

export const StaffNavigation = createStaticNavigation(StaffRootStack);
export const OwnerNavigation = createStaticNavigation(OwnerRootStack);

type StaffRootStackType = typeof StaffRootStack;
type OwnerRootStackType = typeof OwnerRootStack;

declare module "@react-navigation/core" {
  interface RootNavigator extends StaffRootStackType, OwnerRootStackType {}
}
