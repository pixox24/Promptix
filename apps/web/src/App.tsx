import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ToastProvider } from './context/ToastContext';
import { UserLibraryProvider } from './context/UserLibraryContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';

const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const DetailPage = lazy(() => import('./pages/DetailPage').then((module) => ({ default: module.DetailPage })));
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const MyPromptsPage = lazy(() => import('./pages/MyPromptsPage').then((module) => ({ default: module.MyPromptsPage })));

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmDialogProvider>
        <UserLibraryProvider>
          <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-slate-500">正在加载页面…</div>}><Routes>
            <Route path="admin/*" element={<AdminPage />} />
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="template/:id" element={<DetailPage />} />
              <Route path="my" element={<MyPromptsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes></Suspense>
        </UserLibraryProvider>
        </ConfirmDialogProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
