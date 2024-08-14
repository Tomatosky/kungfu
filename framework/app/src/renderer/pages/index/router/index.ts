import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
import Index from '@kungfu-trader/kungfu-app/src/renderer/pages/index/views/Index.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/main',
    name: 'Index',
    component: Index,
    meta: {
      keepAlive: true,
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export function registerRoutes(newRoutes: Array<RouteRecordRaw>): void;
export function registerRoutes(
  parentName: string,
  newRoutes: Array<RouteRecordRaw>,
): void;
export function registerRoutes(
  parentName: string | Array<RouteRecordRaw>,
  newRoutes?: Array<RouteRecordRaw>,
) {
  newRoutes = typeof parentName === 'string' ? newRoutes || [] : parentName;
  parentName = typeof parentName === 'string' ? parentName : '';

  newRoutes.forEach((route) => {
    if (parentName) {
      router.addRoute(parentName as string, route);
    } else {
      router.addRoute(route);
    }
  });
}

export default router;
