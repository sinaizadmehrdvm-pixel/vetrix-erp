import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("vetrix_user");

    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  const login = (username, password) => {
    if (username === "admin" && password === "1234") {
      const fakeUser = {
        username: "admin",
        role: "admin",
      };

      localStorage.setItem(
        "vetrix_user",
        JSON.stringify(fakeUser)
      );

      setUser(fakeUser);

      return true;
    }

    return false;
  };

  const logout = () => {
    localStorage.removeItem("vetrix_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}