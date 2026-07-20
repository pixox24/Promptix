import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ToastProvider } from './context/ToastContext';
import { UserLibraryProvider } from './context/UserLibraryContext';
import { DetailPage } from './pages/DetailPage';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { MyPromptsPage } from './pages/MyPromptsPage';
import { AdminPage } from './pages/AdminPage';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmDialogProvider>
        <UserLibraryProvider>
          <Routes>
            <Route path="admin/*" element={<AdminPage />} />
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="template/:id" element={<DetailPage />} />
              <Route path="my" element={<MyPromptsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </UserLibraryProvider>
        </ConfirmDialogProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
