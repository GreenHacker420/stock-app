import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createStaticNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Icon } from 'react-native-paper';
import { CloseDay } from './screens/CloseDay';
import { Home } from './screens/Home';
import { OpenCashSession } from './screens/OpenCashSession';
import { OrdersToPack } from './screens/OrdersToPack';
import { Profile } from './screens/Profile';
import { Settings } from './screens/Settings';
import { StockEntry } from './screens/StockEntry';
import { Updates } from './screens/Updates';
import { NotFound } from './screens/NotFound';
import { WalkInSale } from './screens/WalkInSale';
import { CreateEditShop } from './screens/CreateEditShop';
import { AssignStaff } from './screens/AssignStaff';
import { SetOpeningStock } from './screens/SetOpeningStock';
import { PaymentVerification } from './screens/PaymentVerification';
import { CashClosingReview } from './screens/CashClosingReview';
import { DailySummary } from './screens/DailySummary';

const HomeTabs = createBottomTabNavigator({
  screenOptions: {
    headerShown: false,
  },
  screens: {
    Home: {
      screen: Home,
      options: {
        title: 'Today',
        tabBarIcon: ({ color, size }) => <Icon source="view-dashboard-outline" color={color} size={size} />,
      },
    },
    Updates: {
      screen: Updates,
      options: {
        title: 'Shops',
        tabBarIcon: ({ color, size }) => <Icon source="storefront-outline" color={color} size={size} />,
      },
    },
    Settings: {
      screen: Settings,
      options: {
        title: 'Work',
        tabBarIcon: ({ color, size }) => <Icon source="clipboard-list-outline" color={color} size={size} />,
      },
    },
    Profile: {
      screen: Profile,
      options: {
        tabBarIcon: ({ color, size }) => <Icon source="account-circle-outline" color={color} size={size} />,
      },
    },
  },
});

const RootStack = createNativeStackNavigator({
  initialRouteName: 'HomeTabs',
  screenOptions: {
    headerShown: false,
  },
  screens: {
    HomeTabs: {
      screen: HomeTabs,
      options: {
        title: 'Home',
        headerShown: false,
      },
    },
    NotFound: {
      screen: NotFound,
      options: {
        title: '404',
      },
      linking: {
        path: '*',
      },
    },
    WalkInSale: {
      screen: WalkInSale,
      options: {
        title: 'Walk-in sale',
      },
    },
    OpenCashSession: {
      screen: OpenCashSession,
      options: {
        title: 'Open cash session',
      },
    },
    StockEntry: {
      screen: StockEntry,
      options: {
        title: 'Stock entry',
      },
    },
    OrdersToPack: {
      screen: OrdersToPack,
      options: {
        title: 'Orders to pack',
      },
    },
    CloseDay: {
      screen: CloseDay,
      options: {
        title: 'Close day',
      },
    },
    CreateEditShop: {
      screen: CreateEditShop,
      options: {
        title: 'Manage shop',
      },
    },
    AssignStaff: {
      screen: AssignStaff,
      options: {
        title: 'Assign staff',
      },
    },
    SetOpeningStock: {
      screen: SetOpeningStock,
      options: {
        title: 'Set opening stock',
      },
    },
    PaymentVerification: {
      screen: PaymentVerification,
      options: {
        title: 'Verify payments',
      },
    },
    CashClosingReview: {
      screen: CashClosingReview,
      options: {
        title: 'Cash closing review',
      },
    },
    DailySummary: {
      screen: DailySummary,
      options: {
        title: 'Daily summary',
      },
    },
  },
});

export const Navigation = createStaticNavigation(RootStack);

type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}
