import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, ClipboardList } from 'lucide-react';
import { signInToSupabase, fetchRestaurantProfile } from '../services/supabase';

interface LoginScreenProps {
  onLoginSuccess: (restaurantId: string, restaurantName: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg("Email/Username and PIN are required");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Sign in to retrieve user session and metadata
      const authResult = await signInToSupabase(email.trim(), password.trim());
      
      // Fetch corresponding restaurant profile (using restaurantId from metadata if staff, else owner_email)
      const profile = await fetchRestaurantProfile(
        authResult.restaurantId
          ? { id: authResult.restaurantId }
          : { email: email.trim() }
      );

      // Save details to LocalStorage
      localStorage.setItem('staff_is_authenticated', 'true');
      localStorage.setItem('staff_restaurant_id', profile.id);
      localStorage.setItem('staff_restaurant_name', profile.name);
      localStorage.setItem('staff_owner_email', email.trim());

      onLoginSuccess(profile.id, profile.name);
    } catch (err: any) {
      console.error("Authentication failed:", err);
      setErrorMsg(err.message || "Authentication failed. Please verify credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full min-h-screen flex justify-center items-center bg-[#f7f9fb] px-4 font-body">
      {/* Dynamic Background Accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute w-[600px] h-[600px] rounded-full bg-orange-500/5 -top-48 -left-48 blur-3xl" />
        <div className="absolute w-[600px] h-[600px] rounded-full bg-violet-600/5 -bottom-48 -right-48 blur-3xl" />
      </div>

      {/* Login Card */}
      <div className="w-full max-w-[440px] z-10 bg-white border border-[#e0e3e5] rounded-2xl shadow-xl p-8 md:p-10 flex flex-col items-center">
        {/* App Icon */}
        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-6">
          <ClipboardList size={36} className="text-orange-500" />
        </div>

        <h1 className="text-2xl font-bold text-[#191c1e] tracking-tight mb-1">
          BIBORA STAFF
        </h1>
        <p className="text-sm text-[#584237] mb-8">
          Order Hub Portal
        </p>

        <form onSubmit={handleLogin} className="w-full space-y-5">
          {/* Email field */}
          <div className="space-y-2 text-left">
            <label className="block text-xs font-semibold text-[#584237]">
              Email or Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c7164]">
                <Mail size={18} />
              </span>
              <input
                type="text"
                placeholder="owner@restaurant.com or username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full h-12 pl-12 pr-4 bg-[#f2f4f6] border border-transparent rounded-xl focus:border-orange-500 focus:bg-white transition-all text-sm outline-none"
                required
              />
            </div>
          </div>

          {/* PIN field */}
          <div className="space-y-2 text-left">
            <label className="block text-xs font-semibold text-[#584237]">
              Activation PIN
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8c7164]">
                <Lock size={18} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter Activation PIN"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full h-12 pl-12 pr-12 bg-[#f2f4f6] border border-transparent rounded-xl focus:border-orange-500 focus:bg-white transition-all text-sm outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8c7164] hover:text-[#584237]"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="text-red-600 text-sm font-medium text-center bg-red-50 p-2.5 rounded-lg border border-red-100">
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:scale-100 disabled:opacity-60 text-white font-semibold rounded-xl shadow-lg shadow-orange-500/20 flex items-center justify-center transition-all text-base uppercase tracking-wider"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              "Activate Panel"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
