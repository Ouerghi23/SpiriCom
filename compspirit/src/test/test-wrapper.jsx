// src/test/test-wrapper.jsx
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";

import i18n from "i18next";
import { I18nextProvider } from "react-i18next";

i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: {
      translation: {}
    }
  }
});
export function TestWrapper({ children }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </ThemeProvider>
    </I18nextProvider>
  );
}