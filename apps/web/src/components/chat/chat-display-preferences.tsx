import { createContext, useContext, useState } from "react";

interface ChatDisplayPreferences {
  showThinking: boolean;
}

type ChatDisplayPreferencesContextValue = ChatDisplayPreferences & {
  setShowThinking: (value: boolean) => void;
};

const STORAGE_KEY = "buni-chat-display";

const defaultPreferences: ChatDisplayPreferences = {
  showThinking: false,
};

const readStorage = (): ChatDisplayPreferences => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultPreferences;
    }

    return {
      ...defaultPreferences,
      ...JSON.parse(raw),
    };
  } catch {
    return defaultPreferences;
  }
};

const writeStorage = (value: ChatDisplayPreferences) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const ChatDisplayPreferencesContext =
  createContext<ChatDisplayPreferencesContextValue>({
    ...defaultPreferences,
    setShowThinking: () => {},
  });

function ChatDisplayPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState<ChatDisplayPreferences>(() =>
    readStorage()
  );

  const setShowThinking = (value: boolean) => {
    const next = {
      ...preferences,
      showThinking: value,
    };

    writeStorage(next);
    setPreferences(next);
  };

  return (
    <ChatDisplayPreferencesContext.Provider
      value={{
        ...preferences,
        setShowThinking,
      }}
    >
      {children}
    </ChatDisplayPreferencesContext.Provider>
  );
}

const useChatDisplayPreferences = () =>
  useContext(ChatDisplayPreferencesContext);

export type { ChatDisplayPreferences };
export { ChatDisplayPreferencesProvider, useChatDisplayPreferences };
