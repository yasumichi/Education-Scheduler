## USER 🧑‍💻

現在の認証方法を残しつつ、設定変更により、シングルサインオンを実現したい。どのような修正アプローチが考えられるか。


## MODEL ✨

現行の認証（JWT + HttpOnly Cookie）を維持したままシングルサインオン（SSO）を実現するために、OpenID Connect (OIDC) を導入するアプローチを提案します。

### 修正アプローチの概要

1.  **データベースの拡張**: `SystemSetting` モデルに SSO 有効化フラグ、クライアントID、クライアントシークレット、発行者URL（Issuer URL）などの設定項目を追加します。また、`User` モデルに SSO 固有の識別子（`ssoId`）を保持できるようにします。
2.  **バックエンドの実装**: SSO ログインの開始、およびプロバイダーからのコールバックを処理するエンドポイントを新設します。認証成功時には、既存のログイン処理と同じ `auth_token` Cookie を発行することで、以降のアクセス制御を共通化します。
3.  **フロントエンドの修正**: システム設定画面に SSO 設定項目を追加し、ログイン画面では SSO が有効な場合に「SSOでログイン」ボタンを表示するようにします。
4.  **ユーザーのマッピング**: SSO で取得したメールアドレスを基に既存ユーザーと紐付けるか、自動プロビジョニング設定が有効な場合は新規ユーザーを自動作成するロジックを実装します。

### 検討事項（ご相談）

-   **設定の保存場所**: クライアントシークレットなどの機密情報をデータベースに保存し UI から設定可能にするか、環境変数での管理に限定するか。
-   **ユーザーの自動作成**: SSO で初めてログインしたユーザーを自動的に作成するか、事前に管理者が登録したユーザーのみ許可するか。

詳細な実装手順をまとめたプランを作成しました。この方針で進めてよろしいでしょうか？

```markdown:plans/sso-integration.md
# SSO Integration Plan

This plan outlines the steps to integrate Single Sign-On (SSO) using OpenID Connect (OIDC) into ScholaTile, while maintaining the existing authentication method.

## 1. Database Updates
- Modify `backend/prisma/schema.prisma`:
    - Update `User` model to include `ssoId` (optional).
    - Update `SystemSetting` model to include SSO-related fields:
        - `ssoEnabled`: Boolean
        - `ssoClientId`: String
        - `ssoClientSecret`: String
        - `ssoIssuerUrl`: String
        - `ssoAllowedDomain`: String (optional)
        - `ssoAutoProvisioning`: Boolean (optional, if we want to auto-create users)
- Run `prisma migrate` or `prisma db push` to apply changes.

## 2. Backend Implementation (`backend/src/index.ts`)
- Implement SSO routes:
    - `GET /api/auth/sso/login`: Initiates OIDC flow.
    - `GET /api/auth/sso/callback`: Handles the redirect, verifies tokens, finds/creates users, and sets the `auth_token` cookie.
- Update `GET /api/settings` to include SSO settings (masking the secret).
- Update `POST /api/settings` to handle SSO settings updates.

## 3. Frontend Implementation
- **`src/components/SystemSettingManager.tsx`**:
    - Add UI fields for SSO configuration.
- **`src/components/Login.tsx`**:
    - Fetch SSO settings.
    - If `ssoEnabled` is true, display a "Sign in with SSO" button.
- **`src/types.ts`**: Update `SystemSetting` type definition.

## 4. Internationalization
- Update `public/locales/en/translation.json` and `public/locales/ja/translation.json` with new strings:
    - "SSO Settings"
    - "Enable SSO"
    - "Client ID"
    - "Client Secret"
    - "Issuer URL"
    - "Allowed Domain"
    - "Sign in with SSO"

## Verification Steps
1. Configure OIDC provider (e.g., Google Cloud Console, Microsoft Entra ID).
2. Enable SSO in ScholaTile system settings.
3. Logout and verify the "Sign in with SSO" button appears on the login page.
4. Click the button and complete the SSO flow.
5. Verify that the user is successfully logged in and can access protected routes.
6. Verify that traditional email/password login still works.
```

---

## USER 🧑‍💻

plans/sso-integration.md について、日本語訳を提示してください。

---


## MODEL ✨

`plans/sso-integration.md` の日本語訳を作成しました。ファイル名は `sso-integration-ja.md` として保存しています。

```markdown:/home/yasumichi/.gemini/tmp/education-scheduler/be4bede8-4bd6-4b16-b702-df58822a1c09/plans/sso-integration-ja.md
# SSO連携 実施計画

この計画は、既存の認証方法を維持しつつ、OpenID Connect (OIDC) を使用したシングルサインオン (SSO) を ScholaTile に統合するための手順をまとめたものです。

## 1. データベースの更新
- `backend/prisma/schema.prisma` の修正:
    - `User` モデルに `ssoId` (任意) を追加。
    - `SystemSetting` モデルに SSO 関連のフィールドを追加:
        - `ssoEnabled`: Boolean (有効/無効)
        - `ssoClientId`: String (クライアントID)
        - `ssoClientSecret`: String (クライアントシークレット)
        - `ssoIssuerUrl`: String (発行者URL)
        - `ssoAllowedDomain`: String (許可されたドメイン、任意)
        - `ssoAutoProvisioning`: Boolean (自動プロビジョニング、任意。ユーザーの自動作成用)
- `prisma migrate` または `prisma db push` を実行して変更を適用。

## 2. バックエンドの実装 (`backend/src/index.ts`)
- SSO 用ルートの実装:
    - `GET /api/auth/sso/login`: OIDC フローを開始。
    - `GET /api/auth/sso/callback`: リダイレクトを処理し、トークンを検証、ユーザーの特定または作成を行い、`auth_token` Cookie を設定。
- `GET /api/settings` を更新し、SSO 設定を含めるように変更 (シークレットはマスクする)。
- `POST /api/settings` を更新し、SSO 設定の更新を処理。

## 3. フロントエンドの実装
- **`src/components/SystemSettingManager.tsx`**:
    - SSO 設定用の UI フィールドを追加。
- **`src/components/Login.tsx`**:
    - SSO 設定を取得。
    - `ssoEnabled` が true の場合、「SSOでサインイン」ボタンを表示。
- **`src/types.ts`**: `SystemSetting` 型定義の更新。

## 4. 国際化 (i18n)
- `public/locales/en/translation.json` と `public/locales/ja/translation.json` に新しい文言を追加:
    - "SSO Settings" / "SSO設定"
    - "Enable SSO" / "SSOを有効にする"
    - "Client ID" / "クライアントID"
    - "Client Secret" / "クライアントシークレット"
    - "Issuer URL" / "発行者URL"
    - "Allowed Domain" / "許可ドメイン"
    - "Sign in with SSO" / "SSOでサインイン"

## 検証手順
1. OIDC プロバイダー (Google Cloud Console, Microsoft Entra ID 等) を設定。
2. ScholaTile のシステム設定で SSO を有効化。
3. ログアウトし、ログインページに「SSOでサインイン」ボタンが表示されることを確認。
4. ボタンをクリックし、SSO フローを完了させる。
5. ログインが成功し、保護されたルートにアクセスできることを確認。
6. 従来のメール/パスワードによるログインが引き続き機能することを確認。
```

---

## USER 🧑‍💻

Active Directory との連携は可能か?

---


## MODEL ✨

Active Directory (AD) との連携は、**可能です**。主に以下の3つのアプローチが考えられますが、前述の「SSO連携計画（OIDC）」は、1と2をカバーするように設計しています。

### 1. Microsoft Entra ID (旧 Azure AD) との連携
クラウドベースの AD を利用している場合、**OpenID Connect (OIDC)** を使用してシームレスに連携できます。
- **メリット**: 提示した計画（OIDC）をそのまま適用でき、セキュアで最新の手法です。
- **設定**: Entra ID 側で「アプリの登録」を行い、クライアントID、シークレット、発行者URLを ScholaTile の設定画面に入力するだけで完了します。

### 2. オンプレミス AD + AD FS (Active Directory Federation Services)
社内のオンプレミス AD を利用しており、**AD FS** が導入されている場合、これも **OIDC** で連携可能です。
- **メリット**: 社内ネットワーク内の AD 情報を安全に外部（またはクラウド上の ScholaTile）と連携できます。
- **設定**: Windows Server の AD FS 管理画面で「アプリケーション・グループ」を作成し、ScholaTile と紐付けます。

### 3. LDAP による直接連携
AD サーバーに直接 **LDAP プロトコル** で問い合わせる方法です。
- **用途**: AD FS がなく、ネットワーク的に AD サーバーに直接アクセス可能な場合（VPN内など）。
- **注意点**: バックエンドに `ldapjs` などのライブラリを追加し、独自の認証ロジックを実装する必要があります。前述の OIDC 計画とは実装内容が大きく異なります。

---

### 推奨される進め方
現在の組織で **Microsoft Entra ID (Azure AD)** を利用されているか、あるいは **AD FS** が利用可能であれば、**計画通りの OIDC 方式が最もスムーズかつ安全**です。

もし「オンプレミス AD と LDAP で直接通信したい」という特定の要件がある場合は、計画を LDAP 向けに書き直すことも可能です。現在の AD の運用状況はいかがでしょうか？

---

## USER 🧑‍💻

OIDC で実装する場合、「SSOでサインイン」ボタンを使わずに直接、ログインさせるような実装は可能か?

---

## MODEL ✨

「ボタンを押さずに直接ログイン（リダイレクト）」させることは、技術的に**十分可能**です。

運用上の利便性と管理のしやすさを考慮すると、以下の**「ハイブリッド・リダイレクト方式」**をお薦めします。

### お薦めの方式：ハイブリッド・リダイレクト方式

単一の「全ユーザー強制リダイレクト」ではなく、以下の要素を組み合わせた方法が最も実用的です。

1.  **システム設定による自動リダイレクト**:
    - 設定画面に「SSOを強制する（ログイン画面をスキップ）」というオプションを設けます。
    - これが ON の場合、ユーザーが `ScholaTile` にアクセスすると、自動的に OIDC プロバイダーへリダイレクトされます。
2.  **管理者用の「裏口」URL の確保**:
    - SSO プロバイダー側に障害が起きた際、管理者がログインできなくなるのを防ぐため、`/login?direct=true` のような URL で**従来のログイン画面も利用可能**にしておきます。
3.  **特定の URL による自動開始**:
    - 外部のポータルサイトなどから `ScholaTile` にリンクを貼る際、`https://.../api/auth/sso/login` を直接参照させることで、ボタンを介さず認証を開始できます。

### なぜこの方式がお薦めなのか？

-   **ユーザー体験 (UX)**: ユーザーはログイン画面を見ることなく、既に AD 等にログインしていれば一瞬で ScholaTile が開きます。
-   **安全性（可用性）**: 万が一 AD や SSO 連携設定に問題が発生しても、管理者が従来の方法でログインして設定を修正できるため、システムが完全にロックアウトされるリスクを回避できます。
-   **柔軟性**: 全員一律で SSO に飛ばすのか、ボタンを残すのかを設定一つで切り替えられるため、段階的な導入にも向いています。

この「自動リダイレクト機能（＋管理者用バックドア）」を計画に含める形で修正しましょうか？

---

## USER 🧑‍💻

この「自動リダイレクト機能（＋管理者用バックドア）」を計画に含める形で修正

---


## MODEL ✨

「自動リダイレクト機能」および「管理者用バックドア（?direct=true）」を盛り込んだ、改訂版の実施計画（v2）を作成しました。

この計画では、利便性と安全性の両立を重視しています。

```markdown:plans/sso-integration-v2-ja.md
# SSO連携 実施計画 (自動リダイレクト対応版)

この計画は、既存の認証方法を維持しつつ、OpenID Connect (OIDC) を使用したシングルサインオン (SSO) を ScholaTile に統合するための手順をまとめたものです。特に、ユーザーの利便性を高めるための「自動リダイレクト機能」と、保守性を確保するための「管理者用バックドア」を含んでいます。

## 1. データベースの更新
- `backend/prisma/schema.prisma` の修正:
    - `User` モデルに `ssoId` (任意) を追加。
    - `SystemSetting` モデルに以下のフィールドを追加:
        - `ssoEnabled`: Boolean (SSO機能自体の有効化)
        - `ssoForceRedirect`: Boolean (ログイン画面をスキップして自動リダイレクトするか)
        - `ssoClientId`: String
        - `ssoClientSecret`: String
        - `ssoIssuerUrl`: String
        - `ssoAllowedDomain`: String (任意)
        - `ssoAutoProvisioning`: Boolean (ユーザーの自動作成)
- `prisma migrate` または `prisma db push` を実行。

## 2. バックエンドの実装 (`backend/src/index.ts`)
- **SSO用ルートの新設**:
    - `GET /api/auth/sso/login`: OIDCプロバイダーへの認証リクエストを開始。
    - `GET /api/auth/sso/callback`: 認証完了後のリダイレクトを受け取り、JWTトークン（Cookie）を発行。
- **設定エンドポイントの更新**:
    - `GET /api/settings`: フロントエンドが `ssoEnabled` と `ssoForceRedirect` を判断できるよう情報を公開。
    - `POST /api/settings`: 新しいSSO設定項目の保存に対応。

## 3. フロントエンドの実装
- **ログイン画面 (`src/components/Login.tsx`)**:
    - **自動リダイレクト・ロジック**: `ssoForceRedirect` が有効、かつ URL パラメータに `direct=true` が**含まれない**場合、コンポーネント読み込み時に `GET /api/auth/sso/login` へ自動的に遷移させる。
    - **バックドアURL**: `?direct=true` が付与されている場合は、自動リダイレクトを停止し、従来のメール/パスワード入力フォームを表示。
- **システム設定画面 (`src/components/SystemSettingManager.tsx`)**:
    - SSOの各設定項目（有効化、自動リダイレクト、各種ID/URL）を入力・保存できる UI を追加。
- **型定義 (`src/types.ts`)**: `SystemSetting` 型の更新。

## 4. 国際化 (i18n)
- `public/locales/ja/translation.json` 等に以下の項目を追加:
    - `Enable SSO`: "SSOを有効にする"
    - `Force SSO Redirect`: "SSOログインを強制する (自動リダイレクト)"
    - `SSO Configuration`: "SSO設定"
    - `Sign in with SSO`: "SSOでサインイン"

## 検証手順
1. **自動リダイレクト**: SSO設定を有効にし、自動リダイレクトを ON にした状態でサイトにアクセスし、自動的にプロバイダーのログイン画面に飛ぶことを確認。
2. **バックドアの確認**: ブラウザのアドレスバーに `?direct=true` を付けてアクセスし、従来のログイン画面が表示されることを確認。
3. **認証成功後の動作**: SSO認証完了後、正常に ScholaTile のメイン画面が表示され、自分のデータ（講師情報等）が紐付いていることを確認。
4. **設定の切り替え**: 自動リダイレクトを OFF にした際、ログイン画面に「SSOでサインイン」ボタンが表示されることを確認。
```

この方針で進めてよろしいでしょうか？

---

## USER 🧑‍💻

オープンソースで OIDC プロバイダーを構築する場合のお薦めは?

---

## MODEL ✨

オープンソースの OIDC プロバイダーを自前で構築する場合、用途に合わせて以下の3つが特にお薦めです。

### 1. Keycloak (最も多機能・エンタープライズ向け)
Red Hat が支援している、最もメジャーで「枯れた」OSS です。
- **特徴**: AD/LDAP との連携、ソーシャルログイン、ユーザー管理画面、多要素認証 (MFA) など、認証に必要な機能がすべて揃っています。
- **メリット**: 設定だけでほとんどの要件が満たせます。Node.js との親和性も非常に高いです。
- **デメリット**: Java ベース（Quarkus）のため、メモリ消費がやや大きく、多機能ゆえに管理画面の設定項目が多いです。

### 2. Zitadel (モダン・開発者体験重視)
Go 言語で書かれた、比較的新しい次世代の認証基盤です。
- **特徴**: 「B2B SaaS 向け」を意識して作られており、マルチテナント管理が非常に得意です。
- **メリット**: UI が非常に洗練されており、API ファーストで設計されているため、プログラムからの操作が容易です。
- **デメリット**: Keycloak に比べるとコミュニティの歴史は浅いですが、急速に普及しています。

### 3. Logto (Auth0 に最も近い操作感)
TypeScript/Node.js で構築された、Auth0 のオープンソース版を目指しているプロジェクトです。
- **特徴**: ScholaTile と同じ技術スタック (Node.js/TypeScript) で書かれており、非常に親しみやすいです。
- **メリット**: セットアップが極めて簡単で、管理画面の UX が Auth0 のように直感的です。
- **デメリット**: エンタープライズ向けの複雑な連携（古い LDAP 等）については Keycloak に一歩譲る場合があります。

---

### 個人的な推奨：
- **「AD/LDAP との確実な連携」と「安定性」**を重視するなら： **Keycloak**
- **「マルチテナント（複数の組織を分ける）」**を将来的に考えるなら： **Zitadel**
- **「Auth0 のような使いやすさ」と「軽量さ」**を求めるなら： **Logto**

まずは Docker 等でサクッと試せる **Logto** か、実績重視の **Keycloak** のどちらかを検討されるのが良いかと思います。
