const ERROR_MAP: Record<string, string> = {
  UNAUTHORIZED: "APIキーが設定されていません。APIキーを入力してください。",
  FORBIDDEN: "APIキーが無効か、クレジットが不足しています。APIキーを確認してください。",
  INVALID_INPUT: "入力内容に誤りがあります。生年月日・出生地などをご確認ください。",
  INVALID_TIMEZONE: "タイムゾーンの形式が正しくありません（例: Asia/Tokyo）。",
  UNSUPPORTED_PERIOD: "期間の指定が正しくありません。「1日」または「1ヶ月」を選択してください。",
  CALCULATION_FAILED: "データ計算に失敗しました。出生地の座標や日付の範囲をご確認ください。",
  INTERNAL_ERROR: "サーバーエラーが発生しました。しばらく待ってから再度お試しください。",
  NETWORK_ERROR: "通信エラーが発生しました。インターネット接続をご確認ください。",
  TIMEOUT: "応答タイムアウトしました。しばらく待ってから再度お試しください（初回起動時は15秒ほどかかる場合があります）。",
};

export function getUserFriendlyError(code: string, fallback?: string): string {
  return ERROR_MAP[code] ?? fallback ?? "予期しないエラーが発生しました。再度お試しください。";
}
