"use client";
import { useState, useCallback } from "react";
import type { FormValues, ApiType, Mode, ApiResponse, ApiSuccessResponse } from "@/lib/types";
import { getUserFriendlyError } from "@/lib/errorMessages";
import ResponseDisplay from "./ResponseDisplay";

const TIMEZONES = [
  "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Asia/Taipei",
  "Asia/Singapore", "Asia/Bangkok", "Asia/Kolkata", "Asia/Dubai",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Pacific/Auckland", "Australia/Sydney", "UTC",
];

const today = new Date().toISOString().slice(0, 10);

const defaultValues: FormValues = {
  mode: "sandbox",
  apiType: "combined",
  name: "",
  birthDate: "1990-01-15",
  birthTime: "12:00",
  birthPlace: "東京都",
  lat: "35.6812",
  lon: "139.7671",
  timezone: "Asia/Tokyo",
  gender: "female",
  targetDate: today,
  period: "day",
};

const API_TYPE_OPTIONS: { value: ApiType; label: string; desc: string; badge?: string }[] = [
  { value: "combined",      label: "統合分析",       desc: "西洋占星術＋四柱推命＋トランジット（おすすめ）", badge: "おすすめ" },
  { value: "western",       label: "西洋占星術",     desc: "ネイタルチャート・天体位置・アスペクト" },
  { value: "shichusuimei",  label: "四柱推命",       desc: "命式・大運・十神・五行バランス" },
  { value: "transit",       label: "トランジット",   desc: "指定日の天体配置と出生図との関係" },
];

export default function AstroForm() {
  const [values, setValues] = useState<FormValues>(defaultValues);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiSuccessResponse | null>(null);
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const needsLatLon = values.apiType !== "shichusuimei";
  const needsGender = values.apiType === "shichusuimei" || values.apiType === "combined";
  const needsTargetDate = values.apiType === "transit" || values.apiType === "combined";

  const handleGeocode = async () => {
    if (!values.birthPlace.trim()) { setGeoError("出生地を入力してください"); return; }
    setIsGeoLoading(true);
    setGeoError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(values.birthPlace)}`);
      const data = await res.json();
      if (!res.ok) { setGeoError(data.error ?? "座標の取得に失敗しました"); return; }
      set("lat", String(data.lat));
      set("lon", String(data.lon));
    } catch {
      setGeoError("座標の取得に失敗しました");
    } finally {
      setIsGeoLoading(false);
    }
  };

  const buildPayload = () => {
    const base: Record<string, unknown> = {
      birth_date: values.birthDate,
    };
    if (values.name) base.name = values.name;
    if (values.birthPlace) base.birth_place = values.birthPlace;
    if (values.timezone) base.timezone = values.timezone;

    if (values.mode === "sandbox") {
      if (needsTargetDate) base.target_date = values.targetDate;
      return base;
    }

    if (values.birthTime) base.birth_time = values.birthTime;
    if (needsLatLon) {
      base.lat = parseFloat(values.lat);
      base.lon = parseFloat(values.lon);
    }
    if (needsGender) base.gender = values.gender;
    if (needsTargetDate) {
      base.target_date = values.targetDate;
      base.period = values.period;
    }
    return base;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/astro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: values.mode, apiType: values.apiType, payload: buildPayload() }),
      });

      const data: ApiResponse = await res.json();
      if (!data.ok) {
        setError(getUserFriendlyError((data as { ok: false; error: { code: string; message: string } }).error?.code, (data as { ok: false; error: { code: string; message: string } }).error?.message));
      } else {
        setResult(data as ApiSuccessResponse);
      }
    } catch {
      setError(getUserFriendlyError("NETWORK_ERROR"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* mode */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mr-2">1</span>
          利用モードを選択
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { value: "sandbox", label: "無料サンドボックス", desc: "APIキー不要。固定サンプルデータで出力形式を確認できます", icon: "🔓" },
            { value: "apikey",  label: "APIキー版（有料）",  desc: "リアルタイム計算。本人の占術データを生成します",         icon: "🔑" },
          ] as { value: Mode; label: string; desc: string; icon: string }[]).map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                values.mode === opt.value
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={opt.value}
                checked={values.mode === opt.value}
                onChange={() => set("mode", opt.value)}
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="font-medium text-gray-800">{opt.icon} {opt.label}</div>
                <div className="text-sm text-gray-500 mt-0.5">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
        {values.mode === "sandbox" && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            サンドボックスモードでは固定サンプルデータが返されます。APIの出力形式やAIプロンプトの確認にご利用ください。
          </p>
        )}
      </section>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* api type */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mr-2">2</span>
            占術データの種類を選択
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {API_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  values.apiType === opt.value
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="apiType"
                  value={opt.value}
                  checked={values.apiType === opt.value}
                  onChange={() => set("apiType", opt.value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <div className="flex items-center gap-2 font-medium text-gray-800">
                    {opt.label}
                    {opt.badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">{opt.badge}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* birth info */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mr-2">3</span>
            出生情報を入力
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            {/* name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">お名前（任意・表示のみ）</label>
              <input
                type="text"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="例: 山田 太郎"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* birth date + time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  生年月日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={values.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  出生時間
                  {values.mode === "apikey" && <span className="text-red-500"> *</span>}
                  {values.mode === "sandbox" && <span className="text-gray-400 text-xs ml-1">（サンドボックスでは任意）</span>}
                </label>
                <input
                  type="time"
                  value={values.birthTime}
                  onChange={(e) => set("birthTime", e.target.value)}
                  required={values.mode === "apikey"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            {/* birth place + geocode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                出生地 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={values.birthPlace}
                  onChange={(e) => set("birthPlace", e.target.value)}
                  placeholder="例: 東京都、大阪市、Seoul Korea"
                  required
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                {needsLatLon && values.mode === "apikey" && (
                  <button
                    type="button"
                    onClick={handleGeocode}
                    disabled={isGeoLoading}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {isGeoLoading ? "検索中…" : "座標を取得"}
                  </button>
                )}
              </div>
              {geoError && <p className="mt-1 text-xs text-red-600">{geoError}</p>}
            </div>

            {/* lat/lon */}
            {needsLatLon && values.mode === "apikey" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    緯度（Latitude）<span className="text-red-500"> *</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={values.lat}
                    onChange={(e) => set("lat", e.target.value)}
                    required={needsLatLon && values.mode === "apikey"}
                    placeholder="35.6812"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    経度（Longitude）<span className="text-red-500"> *</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={values.lon}
                    onChange={(e) => set("lon", e.target.value)}
                    required={needsLatLon && values.mode === "apikey"}
                    placeholder="139.7671"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
            )}

            {/* gender */}
            {needsGender && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  性別 <span className="text-red-500">*</span>
                  <span className="text-gray-400 text-xs ml-1">（四柱推命の大運計算に使用）</span>
                </label>
                <div className="flex gap-4">
                  {(["female", "male"] as const).map((g) => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={values.gender === g}
                        onChange={() => set("gender", g)}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-gray-700">{g === "female" ? "女性" : "男性"}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* target date + period */}
            {needsTargetDate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    基準日 <span className="text-red-500">*</span>
                    <span className="text-gray-400 text-xs ml-1">（トランジット計算の対象日）</span>
                  </label>
                  <input
                    type="date"
                    value={values.targetDate}
                    onChange={(e) => set("targetDate", e.target.value)}
                    required={needsTargetDate}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                {values.mode === "apikey" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">期間</label>
                    <select
                      value={values.period}
                      onChange={(e) => set("period", e.target.value as "day" | "month")}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="day">1日</option>
                      <option value="month">1ヶ月</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* timezone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">タイムゾーン</label>
              <select
                value={values.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* submit */}
        <div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold rounded-xl text-base transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                占術データを生成中…（初回は15秒ほどかかる場合があります）
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
                占術データを生成する
              </>
            )}
          </button>
        </div>
      </form>

      {/* error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800">
          <svg className="w-5 h-5 mt-0.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">エラーが発生しました</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* result */}
      {result && (
        <div className="border border-gray-200 rounded-2xl p-6 bg-gradient-to-br from-gray-50 to-white">
          <ResponseDisplay response={result} apiType={values.apiType} name={values.name} />
        </div>
      )}
    </div>
  );
}
