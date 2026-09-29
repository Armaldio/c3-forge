import {
  createRouter,
  createWebHashHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router'
import ProjectWorkspace from '../features/workspace/ProjectWorkspace.vue'
import {
  PROJECT_WORKSPACE_ROUTE,
  RESOURCES_WORKSPACE_ROUTE,
  WORKSPACE_FALLBACK_ROUTE,
} from './navigation'

const workspaceRoutes: RouteRecordRaw[] = [
  { path: '/workspace/project/:token', name: PROJECT_WORKSPACE_ROUTE, component: ProjectWorkspace },
  { path: '/workspace/resources/:token', name: RESOURCES_WORKSPACE_ROUTE, component: ProjectWorkspace },
  { path: '/:pathMatch(.*)*', name: WORKSPACE_FALLBACK_ROUTE, component: ProjectWorkspace },
]

export function createForgeRouter(history?: RouterHistory) {
  return createRouter({ history: history ?? createWebHashHistory(import.meta.env.BASE_URL), routes: workspaceRoutes })
}
