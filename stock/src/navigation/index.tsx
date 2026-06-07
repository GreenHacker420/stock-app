import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Pressable, Dimensions, StyleSheet } from "react-native";
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
import { AddEditCustomer, CustomerList } from "./screens/OwnerCustomers";
import { CustomerDetail } from "./screens/CustomerDetail";
import { ExpenseList } from "./screens/Expenses";
import { VerificationQueue } from "./screens/VerificationQueue";
import { AddEditItem, ItemDetail, ItemList } from "./screens/OwnerItems";
import { SaleDetail, SalesList } from "./screens/OwnerSales";
import { AddEditStaff, StaffManagement } from "./screens/OwnerStaff";
import {
  GenericPlannedScreen,
  OwnerAlerts,
  OwnerRecords,
  OwnerStock,
} from "./screens/PlannedScreens";
import { NewSaleType } from "./screens/NewSaleType";
import { RegularSale } from "./screens/RegularSale";
import { Notifications } from "./screens/Notifications";
import { StaffWork } from "./screens/StaffWork";
import { Profile } from "./screens/Profile";
import { SetOpeningStock } from "./screens/SetOpeningStock";
import { Settings } from "./screens/Settings";
import { StockEntry } from "./screens/StockEntry";
import { TakePayment } from "./screens/TakePayment";
import { Updates } from "./screens/Updates";
import { UpiConfig } from "./screens/UpiConfig";
import { WalkInSale } from "./screens/WalkInSale";
import { CreateOrder } from "./screens/CreateOrder";
import { OrderList } from "./screens/OrderList";
import { OrderDetail } from "./screens/OrderDetail";

import { colors } from "../theme";

import { shadow } from "../theme";

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarPill}>
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
          } else if (route.name === "Notifications" || route.name === "OwnerAlerts") {
            iconName = isFocused ? "bell" : "bell-outline";
          } else if (route.name === "Profile") {
            iconName = isFocused ? "account-circle" : "account-circle-outline";
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
            >
              <View style={[
                styles.iconContainer,
                isFocused && styles.iconContainerActive
              ]}>
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
    bottom: 24,
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
    width: Dimensions.get('window').width * 0.88,
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
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: '#111827',
    transform: [{ scale: 1.08 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
});

const floatingTabOptions = {
  headerShown: false,
};

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
    Notifications: {
      screen: Notifications,
      options: {
        title: "Alerts",
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
    OwnerAlerts: {
      screen: OwnerAlerts,
      options: {
        title: "Alerts",
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
    screen: DailySummary,
    options: { title: "Today summary" },
  },
  Expenses: {
    screen: ExpenseList,
    options: { title: "Expenses" },
  },
  VerificationQueue: {
    screen: VerificationQueue,
    options: { title: "Verification Queue" },
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
