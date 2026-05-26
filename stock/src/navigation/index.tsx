import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createStaticNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton } from 'react-native-paper';
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

const HomeTabs = createBottomTabNavigator({
  screens: {
    Home: {
      screen: Home,
      options: {
        title: 'Today',
        tabBarIcon: ({ color, size }) => <IconButton icon="view-dashboard-outline" iconColor={color} size={size} />,
      },
    },
    Updates: {
      screen: Updates,
      options: {
        title: 'Shops',
        tabBarIcon: ({ color, size }) => <IconButton icon="storefront-outline" iconColor={color} size={size} />,
      },
    },
    Settings: {
      screen: Settings,
      options: {
        title: 'Work',
        tabBarIcon: ({ color, size }) => <IconButton icon="clipboard-list-outline" iconColor={color} size={size} />,
      },
    },
    Profile: {
      screen: Profile,
      options: {
        tabBarIcon: ({ color, size }) => <IconButton icon="account-circle-outline" iconColor={color} size={size} />,
      },
    },
  },
});

const RootStack = createNativeStackNavigator({
  initialRouteName: 'HomeTabs',
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
  },
});

export const Navigation = createStaticNavigation(RootStack);

type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}
