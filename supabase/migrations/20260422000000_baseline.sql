-- DATABASE SCHEMA DUMP
-- Generated on: 2026-04-22T11:42:35.869Z

-- Table: promo_codes
CREATE TABLE public."promo_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "is_used" boolean DEFAULT false,
  "used_by" uuid,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Table: shop_banners_news
CREATE TABLE public."shop_banners_news" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "shop_id" bigint,
  "merchant_id" uuid,
  "content_type" text NOT NULL,
  "content_data" text NOT NULL,
  "status" text DEFAULT 'pending'::text,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Table: cities
CREATE TABLE public."cities" (
  "id" bigint NOT NULL,
  "name" text NOT NULL,
  "state" text NOT NULL,
  "is_active" boolean DEFAULT true,
  "is_open" boolean DEFAULT true
);

-- Table: areas
CREATE TABLE public."areas" (
  "id" bigint NOT NULL,
  "city_id" bigint NOT NULL,
  "name" text NOT NULL
);

-- Table: repo_search_rate_limits
CREATE TABLE public."repo_search_rate_limits" (
  "key_hash" text NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "request_count" integer NOT NULL DEFAULT 0,
  "blocked_until" timestamp with time zone,
  "violation_count" integer NOT NULL DEFAULT 0,
  "last_request_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_term_hash" text
);

-- Table: shop_comments
CREATE TABLE public."shop_comments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "shop_id" bigint NOT NULL,
  "product_id" bigint,
  "user_id" uuid NOT NULL,
  "parent_id" uuid,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "is_vendor_reply" boolean NOT NULL DEFAULT false,
  "moderation_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: categories
CREATE TABLE public."categories" (
  "id" bigint NOT NULL,
  "name" text NOT NULL,
  "icon" text
);

-- Table: notifications
CREATE TABLE public."notifications" (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: profiles
CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "full_name" text,
  "phone" text,
  "city_id" bigint,
  "area_id" bigint,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "avatar_url" text,
  "is_suspended" boolean DEFAULT false,
  "ai_chat_count" integer DEFAULT 0,
  "ai_last_chat_date" date DEFAULT CURRENT_DATE,
  "creation_ip" text,
  "ip_country" text,
  "creation_device" text
);

-- Table: support_tickets
CREATE TABLE public."support_tickets" (
  "id" bigint NOT NULL,
  "user_id" uuid,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "message" text NOT NULL,
  "status" text DEFAULT 'open'::text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: announcements
CREATE TABLE public."announcements" (
  "id" bigint NOT NULL,
  "city_id" bigint NOT NULL,
  "message" text NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: admins
CREATE TABLE public."admins" (
  "id" uuid NOT NULL,
  "role" USER-DEFINED NOT NULL DEFAULT 'city_admin'::admin_role,
  "city_id" bigint,
  "full_name" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: shop_likes
CREATE TABLE public."shop_likes" (
  "id" bigint NOT NULL,
  "shop_id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: abuse_reports
CREATE TABLE public."abuse_reports" (
  "id" bigint NOT NULL,
  "reporter_id" uuid NOT NULL,
  "category" text NOT NULL,
  "target_name" text,
  "details" text NOT NULL,
  "status" text DEFAULT 'pending'::text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "reporter_email" text
);

-- Table: wishlist
CREATE TABLE public."wishlist" (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "product_id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: whatsapp_clicks
CREATE TABLE public."whatsapp_clicks" (
  "id" bigint NOT NULL,
  "clicker_id" uuid NOT NULL,
  "shop_id" bigint NOT NULL,
  "product_id" bigint,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: shop_views
CREATE TABLE public."shop_views" (
  "id" bigint NOT NULL,
  "shop_id" bigint NOT NULL,
  "viewer_id" uuid,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: physical_verification_payments
CREATE TABLE public."physical_verification_payments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "merchant_id" uuid NOT NULL,
  "merchant_name" text NOT NULL,
  "shop_name" text NOT NULL,
  "city" text NOT NULL,
  "amount" numeric NOT NULL DEFAULT 5000,
  "payment_ref" text NOT NULL,
  "status" text NOT NULL DEFAULT 'success'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: fcm_tokens
CREATE TABLE public."fcm_tokens" (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "device_type" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Table: contact_messages
CREATE TABLE public."contact_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "status" text DEFAULT 'unread'::text
);

-- Table: staff_profiles
CREATE TABLE public."staff_profiles" (
  "id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'staff'::text,
  "department" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "city_id" bigint
);

-- Table: ip_blacklist
CREATE TABLE public."ip_blacklist" (
  "ip_address" text NOT NULL,
  "reason" text DEFAULT 'Violation of Terms'::text,
  "banned_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: anonymous_ai_usage
CREATE TABLE public."anonymous_ai_usage" (
  "ip_address" text NOT NULL,
  "chat_count" integer DEFAULT 0,
  "last_chat_date" text
);

-- Table: shops
CREATE TABLE public."shops" (
  "id" bigint NOT NULL,
  "owner_id" uuid NOT NULL,
  "city_id" bigint NOT NULL,
  "area_id" bigint NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "address" text,
  "phone" text,
  "whatsapp" text,
  "image_url" text,
  "is_verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "status" USER-DEFINED DEFAULT 'pending'::application_status,
  "business_type" text,
  "cac_number" text,
  "cac_certificate_url" text,
  "id_type" text,
  "id_number" text,
  "id_card_url" text,
  "unique_id" text,
  "storefront_url" text,
  "is_featured" boolean NOT NULL DEFAULT false,
  "latitude" double precision,
  "longitude" double precision,
  "rejection_reason" text,
  "subscription_end_date" timestamp with time zone DEFAULT (now() + '1 mon'::interval),
  "subscription_plan" text DEFAULT 'Free Trial'::text,
  "is_open" boolean NOT NULL DEFAULT true,
  "facebook_url" text,
  "instagram_url" text,
  "twitter_url" text,
  "tiktok_url" text,
  "website_url" text,
  "kyc_status" text DEFAULT 'unsubmitted'::text,
  "kyc_video_url" text,
  "id_issued" boolean NOT NULL DEFAULT false,
  "kyc_submission_meta" jsonb,
  "creation_ip" text,
  "creation_device" text
);

-- Table: daily_site_visits
CREATE TABLE public."daily_site_visits" (
  "visit_date" date NOT NULL DEFAULT (timezone('Africa/Lagos'::text, now()))::date,
  "total_visits" bigint NOT NULL DEFAULT 0,
  "authenticated_visits" bigint NOT NULL DEFAULT 0
);

-- Table: sponsored_products
CREATE TABLE public."sponsored_products" (
  "id" bigint NOT NULL,
  "city_id" bigint NOT NULL,
  "image_url" text,
  "link_url" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "status" text NOT NULL DEFAULT 'published'::text,
  "updated_at" timestamp with time zone DEFAULT now(),
  "shop_id" bigint,
  "title" text NOT NULL DEFAULT 'New Promotion'::text,
  "subtitle" text,
  "call_to_action" text DEFAULT 'Claim'::text,
  "external_link" text,
  "template_key" text NOT NULL DEFAULT 'lagoon-blue'::text,
  "sort_order" integer DEFAULT 0,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "layout" text NOT NULL DEFAULT 'split'::text
);

-- Table: product_categories
CREATE TABLE public."product_categories" (
  "id" bigint NOT NULL,
  "name" text NOT NULL,
  "icon" text,
  "group_key" text NOT NULL DEFAULT 'general'::text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: offline_payment_proofs
CREATE TABLE public."offline_payment_proofs" (
  "id" bigint NOT NULL DEFAULT nextval('offline_payment_proofs_id_seq'::regclass),
  "merchant_id" uuid NOT NULL,
  "shop_id" bigint NOT NULL,
  "payment_kind" text NOT NULL,
  "plan" text,
  "amount" integer NOT NULL,
  "merchant_name" text,
  "merchant_email" text,
  "shop_name" text,
  "depositor_name" text,
  "transfer_reference" text,
  "receipt_path" text NOT NULL,
  "receipt_url" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "review_note" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "approval_payment_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: service_fee_payments
CREATE TABLE public."service_fee_payments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "merchant_id" uuid NOT NULL,
  "shop_id" bigint NOT NULL,
  "amount" numeric NOT NULL,
  "plan" text NOT NULL,
  "payment_ref" text NOT NULL,
  "status" text NOT NULL DEFAULT 'success'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: newsletter_subscriptions
CREATE TABLE public."newsletter_subscriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

-- Table: featured_city_banners
CREATE TABLE public."featured_city_banners" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "city_id" bigint NOT NULL,
  "shop_id" bigint NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "template_key" text NOT NULL DEFAULT 'marketplace_lifestyle'::text,
  "lifestyle_asset_key" text,
  "desktop_image_path" text NOT NULL,
  "desktop_image_url" text NOT NULL,
  "mobile_image_path" text NOT NULL,
  "mobile_image_url" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Table: staff_discoveries
CREATE TABLE public."staff_discoveries" (
  "id" bigint NOT NULL DEFAULT nextval('staff_discoveries_id_seq'::regclass),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "title" text NOT NULL,
  "description" text,
  "price" numeric,
  "image_url" text NOT NULL,
  "contact_phone" text,
  "sort_order" integer DEFAULT 0,
  "status" text DEFAULT 'published'::text
);

-- Table: products
CREATE TABLE public."products" (
  "id" bigint NOT NULL,
  "shop_id" bigint NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "price" numeric NOT NULL,
  "discount_price" numeric,
  "condition" text,
  "image_url" text,
  "is_available" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "is_approved" boolean NOT NULL DEFAULT false,
  "attributes" jsonb DEFAULT '{}'::jsonb,
  "image_url_2" text,
  "image_url_3" text,
  "stock_count" integer NOT NULL DEFAULT 1,
  "out_of_stock_at" timestamp with time zone,
  "category" text,
  "rejection_reason" text
);

-- Table: login_security_guards
CREATE TABLE public."login_security_guards" (
  "email" text NOT NULL,
  "user_id" uuid,
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "suspended_at" timestamp with time zone,
  "suspension_reason" text,
  "last_failed_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Table: affiliate_applications
CREATE TABLE public."affiliate_applications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone DEFAULT now(),
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "bio" text,
  "marketing_experience" text,
  "social_media_links" text,
  "promotion_plan" text,
  "questionnaire" jsonb,
  "status" text DEFAULT 'pending'::text,
  "user_id" uuid
);

-- RLS POLICIES
-- Policy: No direct delete promo codes on promo_codes
ALTER TABLE public."promo_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct delete promo codes" ON public."promo_codes" FOR DELETE TO public USING (false);

-- Policy: No direct insert promo codes on promo_codes
ALTER TABLE public."promo_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct insert promo codes" ON public."promo_codes" FOR INSERT TO public USING (null) WITH CHECK (false);

-- Policy: No direct read promo codes on promo_codes
ALTER TABLE public."promo_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct read promo codes" ON public."promo_codes" FOR SELECT TO public USING (false);

-- Policy: No direct update promo codes on promo_codes
ALTER TABLE public."promo_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct update promo codes" ON public."promo_codes" FOR UPDATE TO public USING (false) WITH CHECK (false);

-- Policy: Unified delete policy on shop_banners_news
ALTER TABLE public."shop_banners_news" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified delete policy" ON public."shop_banners_news" FOR DELETE TO authenticated USING (((merchant_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Unified insert policy on shop_banners_news
ALTER TABLE public."shop_banners_news" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified insert policy" ON public."shop_banners_news" FOR INSERT TO authenticated USING (null) WITH CHECK (((merchant_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Unified select policy on shop_banners_news
ALTER TABLE public."shop_banners_news" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified select policy" ON public."shop_banners_news" FOR SELECT TO public USING (((status = 'approved'::text) OR (merchant_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Unified update policy on shop_banners_news
ALTER TABLE public."shop_banners_news" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified update policy" ON public."shop_banners_news" FOR UPDATE TO authenticated USING (((merchant_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: areas_select_public on areas
ALTER TABLE public."areas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "areas_select_public" ON public."areas" FOR SELECT TO anon, authenticated USING (true);

-- Policy: cities_select_public on cities
ALTER TABLE public."cities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cities_select_public" ON public."cities" FOR SELECT TO anon, authenticated USING (true);

-- Policy: Public can view categories on categories
ALTER TABLE public."categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view categories" ON public."categories" FOR SELECT TO public USING (true);

-- Policy: shop_comments_delete_staff on shop_comments
ALTER TABLE public."shop_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_comments_delete_staff" ON public."shop_comments" FOR DELETE TO authenticated USING (( SELECT is_staff_user() AS is_staff_user));

-- Policy: shop_comments_insert_authenticated on shop_comments
ALTER TABLE public."shop_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_comments_insert_authenticated" ON public."shop_comments" FOR INSERT TO authenticated USING (null) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM shops s
  WHERE (s.id = shop_comments.shop_id))) AND ((product_id IS NULL) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = shop_comments.product_id) AND (p.shop_id = p.shop_id)))))));

-- Policy: shop_comments_read_approved_public on shop_comments
ALTER TABLE public."shop_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_comments_read_approved_public" ON public."shop_comments" FOR SELECT TO anon USING ((status = 'approved'::text));

-- Policy: shop_comments_read_authenticated on shop_comments
ALTER TABLE public."shop_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_comments_read_authenticated" ON public."shop_comments" FOR SELECT TO authenticated USING (((status = 'approved'::text) OR (( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_staff_user() AS is_staff_user)));

-- Policy: shop_comments_update_staff on shop_comments
ALTER TABLE public."shop_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_comments_update_staff" ON public."shop_comments" FOR UPDATE TO authenticated USING (( SELECT is_staff_user() AS is_staff_user)) WITH CHECK (( SELECT is_staff_user() AS is_staff_user));

-- Policy: profiles_insert_own on profiles
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_insert_own" ON public."profiles" FOR INSERT TO authenticated USING (null) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

-- Policy: profiles_select_logic on profiles
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_logic" ON public."profiles" FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role]))));

-- Policy: profiles_update_logic on profiles
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_update_logic" ON public."profiles" FOR UPDATE TO authenticated USING ((((id = ( SELECT auth.uid() AS uid)) AND (is_suspended = false)) OR (( SELECT get_admin_role() AS get_admin_role) = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role])))) WITH CHECK (((( SELECT get_admin_role() AS get_admin_role) IS NOT NULL) OR ((id = ( SELECT auth.uid() AS uid)) AND (is_suspended = false))));

-- Policy: Admins Send Notifications on notifications
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins Send Notifications" ON public."notifications" FOR INSERT TO authenticated USING (null) WITH CHECK ((get_admin_role() IS NOT NULL));

-- Policy: Admins delete notifications on notifications
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins delete notifications" ON public."notifications" FOR DELETE TO authenticated USING ((get_admin_role() IS NOT NULL));

-- Policy: Unified Notifications Update on notifications
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Notifications Update" ON public."notifications" FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role]))));

-- Policy: View Notifications on notifications
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View Notifications" ON public."notifications" FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Unified Abuse Reports Delete on abuse_reports
ALTER TABLE public."abuse_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Abuse Reports Delete" ON public."abuse_reports" FOR DELETE TO public USING ((get_admin_role() = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role])));

-- Policy: Unified Abuse Reports Insert on abuse_reports
ALTER TABLE public."abuse_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Abuse Reports Insert" ON public."abuse_reports" FOR INSERT TO public USING (null) WITH CHECK (((reporter_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role]))));

-- Policy: Unified Abuse Reports Select on abuse_reports
ALTER TABLE public."abuse_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Abuse Reports Select" ON public."abuse_reports" FOR SELECT TO public USING (((reporter_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role]))));

-- Policy: Unified Abuse Reports Update on abuse_reports
ALTER TABLE public."abuse_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Abuse Reports Update" ON public."abuse_reports" FOR UPDATE TO public USING ((get_admin_role() = ANY (ARRAY['super_admin'::admin_role, 'city_admin'::admin_role])));

-- Policy: Public view likes on shop_likes
ALTER TABLE public."shop_likes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public view likes" ON public."shop_likes" FOR SELECT TO public USING (true);

-- Policy: Users can like shops on shop_likes
ALTER TABLE public."shop_likes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can like shops" ON public."shop_likes" FOR INSERT TO authenticated USING (null) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- Policy: Users can unlike shops on shop_likes
ALTER TABLE public."shop_likes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can unlike shops" ON public."shop_likes" FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

-- Policy: Admins delete announcements on announcements
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins delete announcements" ON public."announcements" FOR DELETE TO authenticated USING ((get_admin_role() IS NOT NULL));

-- Policy: Admins insert announcements on announcements
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins insert announcements" ON public."announcements" FOR INSERT TO authenticated USING (null) WITH CHECK ((get_admin_role() IS NOT NULL));

-- Policy: Admins update announcements on announcements
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins update announcements" ON public."announcements" FOR UPDATE TO authenticated USING ((get_admin_role() IS NOT NULL));

-- Policy: Unified Announcement Select on announcements
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Announcement Select" ON public."announcements" FOR SELECT TO authenticated USING (((get_admin_role() IS NOT NULL) OR ((is_active = true) AND (city_id IN ( SELECT profiles.city_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));

-- Policy: Ticket Delete on support_tickets
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket Delete" ON public."support_tickets" FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Ticket Insert on support_tickets
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket Insert" ON public."support_tickets" FOR INSERT TO authenticated USING (null) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Ticket Manage on support_tickets
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket Manage" ON public."support_tickets" FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Ticket Update on support_tickets
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket Update" ON public."support_tickets" FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (get_admin_role() IS NOT NULL)));

-- Policy: Admins can view admin table on admins
ALTER TABLE public."admins" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view admin table" ON public."admins" FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));

-- Policy: Unified select whatsapp clicks on whatsapp_clicks
ALTER TABLE public."whatsapp_clicks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified select whatsapp clicks" ON public."whatsapp_clicks" FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = whatsapp_clicks.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM admins
  WHERE (admins.id = ( SELECT auth.uid() AS uid))))));

-- Policy: Valid insert for whatsapp clicks on whatsapp_clicks
ALTER TABLE public."whatsapp_clicks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Valid insert for whatsapp clicks" ON public."whatsapp_clicks" FOR INSERT TO public USING (null) WITH CHECK ((shop_id IS NOT NULL));

-- Policy: Users manage own wishlist on wishlist
ALTER TABLE public."wishlist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wishlist" ON public."wishlist" FOR ALL TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- Policy: Log Shop View on shop_views
ALTER TABLE public."shop_views" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Log Shop View" ON public."shop_views" FOR INSERT TO public USING (null) WITH CHECK (((viewer_id IS NULL) OR (viewer_id = ( SELECT auth.uid() AS uid))));

-- Policy: Owners view own shop stats on shop_views
ALTER TABLE public."shop_views" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view own shop stats" ON public."shop_views" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = shop_views.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid))))));

-- Policy: Users can view physical verification payments on physical_verification_payments
ALTER TABLE public."physical_verification_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view physical verification payments" ON public."physical_verification_payments" FOR SELECT TO authenticated USING (((merchant_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (city = ( SELECT cities.name
   FROM cities
  WHERE (cities.id = ( SELECT get_admin_city() AS get_admin_city)))))));

-- Policy: Users manage own fcm tokens on fcm_tokens
ALTER TABLE public."fcm_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fcm tokens" ON public."fcm_tokens" FOR ALL TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- Policy: No direct delete anonymous ai usage on anonymous_ai_usage
ALTER TABLE public."anonymous_ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct delete anonymous ai usage" ON public."anonymous_ai_usage" FOR DELETE TO public USING (false);

-- Policy: No direct insert anonymous ai usage on anonymous_ai_usage
ALTER TABLE public."anonymous_ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct insert anonymous ai usage" ON public."anonymous_ai_usage" FOR INSERT TO public USING (null) WITH CHECK (false);

-- Policy: No direct read anonymous ai usage on anonymous_ai_usage
ALTER TABLE public."anonymous_ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct read anonymous ai usage" ON public."anonymous_ai_usage" FOR SELECT TO public USING (false);

-- Policy: No direct update anonymous ai usage on anonymous_ai_usage
ALTER TABLE public."anonymous_ai_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct update anonymous ai usage" ON public."anonymous_ai_usage" FOR UPDATE TO public USING (false) WITH CHECK (false);

-- Policy: Allow admins to update contact messages on contact_messages
ALTER TABLE public."contact_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admins to update contact messages" ON public."contact_messages" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM admins
  WHERE (admins.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Allow admins to view contact messages on contact_messages
ALTER TABLE public."contact_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admins to view contact messages" ON public."contact_messages" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM admins
  WHERE (admins.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Allow public inserts on contact_messages
ALTER TABLE public."contact_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public inserts" ON public."contact_messages" FOR INSERT TO public USING (null) WITH CHECK (((message IS NOT NULL) AND (length(TRIM(BOTH FROM message)) > 0) AND (email IS NOT NULL) AND (length(TRIM(BOTH FROM email)) > 0)));

-- Policy: Users can view their own staff profile on staff_profiles
ALTER TABLE public."staff_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own staff profile" ON public."staff_profiles" FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));

-- Policy: Public can read blacklist on ip_blacklist
ALTER TABLE public."ip_blacklist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read blacklist" ON public."ip_blacklist" FOR SELECT TO public USING (true);

-- Policy: Unified Shop Delete on shops
ALTER TABLE public."shops" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Shop Delete" ON public."shops" FOR DELETE TO authenticated USING ((( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role));

-- Policy: Unified Shop Insert on shops
ALTER TABLE public."shops" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Shop Insert" ON public."shops" FOR INSERT TO authenticated USING (null) WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) IS NOT NULL)));

-- Policy: Unified Shop Select on shops
ALTER TABLE public."shops" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Shop Select" ON public."shops" FOR SELECT TO public USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (city_id = ( SELECT get_admin_city() AS get_admin_city))) OR ((status = 'approved'::application_status) AND (is_verified = true) AND (is_open = true) AND (subscription_end_date > now()) AND (EXISTS ( SELECT 1
   FROM cities
  WHERE ((cities.id = shops.city_id) AND (cities.is_open = true)))))));

-- Policy: Unified Shop Update on shops
ALTER TABLE public."shops" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Shop Update" ON public."shops" FOR UPDATE TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) IS NOT NULL))) WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) IS NOT NULL)));

-- Policy: Admins and staff can insert sponsored products on sponsored_products
ALTER TABLE public."sponsored_products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and staff can insert sponsored products" ON public."sponsored_products" FOR INSERT TO authenticated USING (null) WITH CHECK (((get_admin_role() IS NOT NULL) OR (EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid))))));

-- Policy: Admins delete promo banners on sponsored_products
ALTER TABLE public."sponsored_products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins delete promo banners" ON public."sponsored_products" FOR DELETE TO authenticated USING ((get_admin_role() IS NOT NULL));

-- Policy: Admins update promo banners on sponsored_products
ALTER TABLE public."sponsored_products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins update promo banners" ON public."sponsored_products" FOR UPDATE TO authenticated USING ((get_admin_role() IS NOT NULL));

-- Policy: Unified read access for sponsored products on sponsored_products
ALTER TABLE public."sponsored_products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified read access for sponsored products" ON public."sponsored_products" FOR SELECT TO public USING (((status = 'published'::text) OR (get_admin_role() IS NOT NULL) OR ((is_active = true) AND (city_id IN ( SELECT profiles.city_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));

-- Policy: Admin delete product categories on product_categories
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin delete product categories" ON public."product_categories" FOR DELETE TO authenticated USING ((get_admin_role() IS NOT NULL));

-- Policy: Admin insert product categories on product_categories
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin insert product categories" ON public."product_categories" FOR INSERT TO authenticated USING (null) WITH CHECK ((get_admin_role() IS NOT NULL));

-- Policy: Admin update product categories on product_categories
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin update product categories" ON public."product_categories" FOR UPDATE TO authenticated USING ((get_admin_role() IS NOT NULL)) WITH CHECK ((get_admin_role() IS NOT NULL));

-- Policy: Public product category read on product_categories
ALTER TABLE public."product_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public product category read" ON public."product_categories" FOR SELECT TO public USING (true);

-- Policy: Users can view service fee payments on service_fee_payments
ALTER TABLE public."service_fee_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view service fee payments" ON public."service_fee_payments" FOR SELECT TO authenticated USING (((merchant_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (shop_id IN ( SELECT shops.id
   FROM shops
  WHERE (shops.city_id = ( SELECT get_admin_city() AS get_admin_city)))))));

-- Policy: Authenticated can read relevant payment proofs on offline_payment_proofs
ALTER TABLE public."offline_payment_proofs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read relevant payment proofs" ON public."offline_payment_proofs" FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = merchant_id) OR (EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid))))));

-- Policy: Merchants can create their own payment proofs on offline_payment_proofs
ALTER TABLE public."offline_payment_proofs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchants can create their own payment proofs" ON public."offline_payment_proofs" FOR INSERT TO authenticated USING (null) WITH CHECK (((( SELECT auth.uid() AS uid) = merchant_id) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = offline_payment_proofs.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid)))))));

-- Policy: Anyone can subscribe to newsletter on newsletter_subscriptions
ALTER TABLE public."newsletter_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can subscribe to newsletter" ON public."newsletter_subscriptions" FOR INSERT TO public USING (null) WITH CHECK (true);

-- Policy: Staff can update newsletter subscriptions on newsletter_subscriptions
ALTER TABLE public."newsletter_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can update newsletter subscriptions" ON public."newsletter_subscriptions" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Staff can view newsletter subscriptions on newsletter_subscriptions
ALTER TABLE public."newsletter_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view newsletter subscriptions" ON public."newsletter_subscriptions" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Authenticated can read active featured city banners on featured_city_banners
ALTER TABLE public."featured_city_banners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read active featured city banners" ON public."featured_city_banners" FOR SELECT TO authenticated USING ((((status = 'published'::text) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at >= now()))) OR ( SELECT is_staff_member() AS is_staff_member)));

-- Policy: Staff can create featured city banners on featured_city_banners
ALTER TABLE public."featured_city_banners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can create featured city banners" ON public."featured_city_banners" FOR INSERT TO authenticated USING (null) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

-- Policy: Staff can delete featured city banners on featured_city_banners
ALTER TABLE public."featured_city_banners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can delete featured city banners" ON public."featured_city_banners" FOR DELETE TO authenticated USING (( SELECT is_staff_member() AS is_staff_member));

-- Policy: Staff can update featured city banners on featured_city_banners
ALTER TABLE public."featured_city_banners" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can update featured city banners" ON public."featured_city_banners" FOR UPDATE TO authenticated USING (( SELECT is_staff_member() AS is_staff_member)) WITH CHECK (( SELECT is_staff_member() AS is_staff_member));

-- Policy: Staff can delete discoveries on staff_discoveries
ALTER TABLE public."staff_discoveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can delete discoveries" ON public."staff_discoveries" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Staff can insert discoveries on staff_discoveries
ALTER TABLE public."staff_discoveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can insert discoveries" ON public."staff_discoveries" FOR INSERT TO authenticated USING (null) WITH CHECK ((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Staff can update discoveries on staff_discoveries
ALTER TABLE public."staff_discoveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can update discoveries" ON public."staff_discoveries" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Unified read access for discoveries on staff_discoveries
ALTER TABLE public."staff_discoveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified read access for discoveries" ON public."staff_discoveries" FOR SELECT TO public USING (((status = 'published'::text) OR (EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid))))));

-- Policy: Unified Product Delete on products
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Product Delete" ON public."products" FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.city_id = ( SELECT get_admin_city() AS get_admin_city))))))));

-- Policy: Unified Product Update on products
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Product Update" ON public."products" FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.city_id = ( SELECT get_admin_city() AS get_admin_city)))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.city_id = ( SELECT get_admin_city() AS get_admin_city))))))));

-- Policy: Unified Product View on products
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unified Product View" ON public."products" FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT get_admin_role() AS get_admin_role) = 'super_admin'::admin_role) OR ((( SELECT get_admin_role() AS get_admin_role) = 'city_admin'::admin_role) AND (EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.city_id = ( SELECT get_admin_city() AS get_admin_city)))))) OR ((is_approved = true) AND (EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.status = 'approved'::application_status) AND (shops.is_open = true) AND (shops.subscription_end_date > now())))))));

-- Policy: Users can create products for their shop on products
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create products for their shop" ON public."products" FOR INSERT TO authenticated USING (null) WITH CHECK ((EXISTS ( SELECT 1
   FROM shops
  WHERE ((shops.id = products.shop_id) AND (shops.owner_id = ( SELECT auth.uid() AS uid)) AND (shops.subscription_end_date > now())))));

-- Policy: Staff can view all affiliate applications on affiliate_applications
ALTER TABLE public."affiliate_applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view all affiliate applications" ON public."affiliate_applications" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM staff_profiles
  WHERE (staff_profiles.id = ( SELECT auth.uid() AS uid)))));

-- Policy: Users can submit their own affiliate applications on affiliate_applications
ALTER TABLE public."affiliate_applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can submit their own affiliate applications" ON public."affiliate_applications" FOR INSERT TO authenticated USING (null) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (user_id IS NULL)));

-- FUNCTIONS
-- Function: get_city_stats
CREATE OR REPLACE FUNCTION public.get_city_stats()
 RETURNS TABLE(city_name text, total_users bigint, total_shops bigint, active_shops bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.name as city_name,
    count(distinct p.id) as total_users,
    count(distinct s.id) as total_shops,
    count(distinct case when s.status = 'approved' then s.id end) as active_shops
  from public.cities c
  left join public.profiles p on c.id = p.city_id
  left join public.shops s on c.id = s.city_id
  group by c.name
  order by total_shops desc, total_users desc;
$function$
;

-- Function: handle_shop_verification
CREATE OR REPLACE FUNCTION public.handle_shop_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Logic: 
  -- 1. Is the admin setting 'is_verified' to TRUE?
  -- 2. Does the shop NOT have an ID yet? (Generate once rule)
  IF NEW.is_verified = true AND OLD.unique_id IS NULL THEN
    
    -- Generate Format: CT-{CityID}{AreaID (000)}{ShopID}
    NEW.unique_id := 'CT-' || NEW.city_id || lpad(NEW.area_id::text, 3, '0') || NEW.id;
    
  END IF;

  RETURN NEW;
END;
$function$
;

-- Function: handle_new_shop_subscription
CREATE OR REPLACE FUNCTION public.handle_new_shop_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Set the default plan to Free Trial
  NEW.subscription_plan := 'Free Trial';
  
  -- Give exactly 1 month
  NEW.subscription_end_date := NOW() + INTERVAL '1 month';
  
  RETURN NEW;
END;
$function$
;

-- Function: match_products
CREATE OR REPLACE FUNCTION public.match_products(search_text text, match_limit integer, p_city_id integer)
 RETURNS TABLE(product_name text, product_price numeric, shop_name text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.name::text, p.price::numeric, s.name::text
  FROM products p
  JOIN shops s ON p.shop_id = s.id
  WHERE p.name ILIKE '%' || search_text || '%'
    AND p.is_available = true
    AND s.city_id = p_city_id   -- THIS IS THE MAGIC LINE!
  LIMIT match_limit;
END;
$function$
;

-- Function: notify_shop_status_change
CREATE OR REPLACE FUNCTION public.notify_shop_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Status Change Logic
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (
      NEW.owner_id, 
      'Shop Application Update', 
      'Your shop application for "' || NEW.name || '" is now ' || NEW.status || '.'
    );
  END IF;

  -- 2. Verification Change Logic
  IF OLD.is_verified IS DISTINCT FROM NEW.is_verified AND NEW.is_verified = true THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (
      NEW.owner_id, 
      'Shop Verified! ✅', 
      'Congratulations! "' || NEW.name || '" has been physically verified. You now have a Blue Badge and a Unique Shop ID visible to customers.'
    );
  END IF;

  RETURN NEW;
END;
$function$
;

-- Function: protect_profile_admin_columns
CREATE OR REPLACE FUNCTION public.protect_profile_admin_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Check if the user is an admin
    IF public.get_admin_role() IS NULL THEN
        -- 1. Permanent Protection
        NEW.id = OLD.id;
        NEW.created_at = OLD.created_at;

        -- 2. Network Info Protection (Allow initial "stamp" but block changes)
        IF (OLD.creation_ip IS NOT NULL AND OLD.creation_ip <> 'Unknown IP' AND length(OLD.creation_ip) > 6) THEN
            NEW.creation_ip = OLD.creation_ip;
        END IF;

        IF (OLD.ip_country IS NOT NULL AND OLD.ip_country <> 'Unknown' AND length(OLD.ip_country) >= 2) THEN
            NEW.ip_country = OLD.ip_country;
        END IF;

        IF (OLD.creation_device IS NOT NULL AND OLD.creation_device <> 'Unknown Device' AND length(OLD.creation_device) > 5) THEN
            NEW.creation_device = OLD.creation_device;
        END IF;

        -- 3. Smart Suspension Protection
        -- Transition from false -> true (Suspending): ALLOWED
        -- Transition from true -> false (Unsuspending): BLOCKED for non-admins
        IF (OLD.is_suspended = true AND NEW.is_suspended = false) THEN
            NEW.is_suspended = OLD.is_suspended;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

-- Function: get_admin_role
CREATE OR REPLACE FUNCTION public.get_admin_role()
 RETURNS admin_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.admins where id = (select auth.uid()); -- Cache Fix
$function$
;

-- Function: get_admin_city
CREATE OR REPLACE FUNCTION public.get_admin_city()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select city_id from public.admins where id = (select auth.uid()); -- Cache Fix
$function$
;

-- Function: trigger_fcm_notification
CREATE OR REPLACE FUNCTION public.trigger_fcm_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- REPLACE THESE TWO VALUES
  project_ref text := 'xdchacdjcgazyckacbpc'; -- Your Project ID
  anon_key    text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY2hhY2RqY2dhenlja2FjYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA2MzMsImV4cCI6MjA4NTExNjYzM30.41V3RaUX-ii-EHysbcVpUCgm0-RsNmuOb8FmYsz72Ow'; -- Your actual Anon Key
  
  -- Construct URL
  func_url    text := 'https://' || project_ref || '.supabase.co/functions/v1/push-notification';
BEGIN
  -- Perform the HTTP POST with the Auth Header
  PERFORM net.http_post(
    url := func_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  
  RETURN NEW;
END;
$function$
;

-- Function: handle_shop_resubmission
CREATE OR REPLACE FUNCTION public.handle_shop_resubmission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Check if the person making the update is the actual owner (merchant) of the shop
    IF auth.uid()::text = OLD.owner_id::text THEN
        
        -- =========================================================
        -- NEW SECURITY: LOCK DOWN CRITICAL IDENTITY FIELDS IF APPROVED
        -- =========================================================
        IF OLD.status = 'approved' THEN
            -- Forcefully revert these fields back to their approved state
            -- so the merchant cannot pivot or hijack the business identity.
            NEW.name := OLD.name;
            NEW.phone := OLD.phone;
            NEW.whatsapp := OLD.whatsapp;
            
            -- (Highly Recommended): Also lock the legal KYC documents
            NEW.cac_number := OLD.cac_number;
            NEW.id_number := OLD.id_number;
        END IF;

        -- =========================================================
        -- RESUBMISSION LOGIC: Move rejected shops back to pending
        -- =========================================================
        IF OLD.status = 'rejected' THEN
            NEW.status := 'pending';
            NEW.rejection_reason := NULL;
        END IF;

        -- =========================================================
        -- ANTI-HACK LOGIC: Prevent merchants from forcing "approved"
        -- =========================================================
        IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
            NEW.status := 'pending'; 
        END IF;

    END IF;
    
    RETURN NEW;
END;
$function$
;

-- Function: stamp_profile_footprint
CREATE OR REPLACE FUNCTION public.stamp_profile_footprint(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _headers json;
  _net json;
  _ua text;
BEGIN
  -- Wrap the whole function so it never returns an error to the frontend
  BEGIN
    _net := public.get_network_info();
    
    BEGIN
      _headers := current_setting('request.headers', true)::json;
      SELECT value INTO _ua FROM json_each_text(_headers) WHERE lower(key) = 'user-agent' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN _ua := 'Unknown Device'; END;

    UPDATE public.profiles
    SET 
      creation_ip = CASE WHEN creation_ip IS NULL OR creation_ip = 'Unknown IP' OR length(trim(creation_ip)) < 7 THEN _net->>'ip' ELSE creation_ip END,
      ip_country = CASE WHEN ip_country IS NULL OR ip_country = 'Unknown' THEN _net->>'country' ELSE ip_country END,
      creation_device = CASE WHEN creation_device IS NULL OR creation_device = 'Unknown Device' THEN coalesce(_ua, 'Unknown Device') ELSE creation_device END
    WHERE id = p_target_user_id;

    -- Link debug log
    BEGIN
      UPDATE public.header_debug_logs SET user_id = p_target_user_id 
      WHERE id = (SELECT id FROM public.header_debug_logs WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 1);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    
    RETURN TRUE;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
END;
$function$
;

-- Function: staff_site_visit_daily
CREATE OR REPLACE FUNCTION public.staff_site_visit_daily(p_days integer DEFAULT 30)
 RETURNS TABLE(visit_date date, total_visits bigint, unique_visitors bigint, authenticated_visits bigint, total_sessions bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff_member() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  return query
  select
    dsv.visit_date,
    dsv.total_visits,
    0::bigint as unique_visitors, -- DROPPED to save bandwidth
    dsv.authenticated_visits,
    0::bigint as total_sessions -- DROPPED to save bandwidth
  from public.daily_site_visits dsv
  where dsv.visit_date >= (timezone('Africa/Lagos', now()))::date - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)
  order by dsv.visit_date asc;
end;
$function$
;

-- Function: handle_shop_creation_fingerprint
CREATE OR REPLACE FUNCTION public.handle_shop_creation_fingerprint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _headers json;
  _net json;
BEGIN
  -- Only run on INSERT (one-time data)
  IF (TG_OP = 'INSERT') THEN
    -- Get IP info
    _net := public.get_network_info();
    -- Get Device info
    _headers := current_setting('request.headers', true)::json;
    
    NEW.creation_ip := _net->>'ip';
    NEW.creation_device := _headers->>'user-agent';
  END IF;
  
  RETURN NEW;
END;
$function$
;

-- Function: protect_shop_admin_columns
CREATE OR REPLACE FUNCTION public.protect_shop_admin_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF public.get_admin_role() IS NULL THEN
        NEW.status = OLD.status;
        NEW.is_verified = OLD.is_verified;
        NEW.is_featured = OLD.is_featured;
        NEW.rejection_reason = OLD.rejection_reason;
        NEW.is_open = OLD.is_open;
        NEW.unique_id = OLD.unique_id;

        IF NEW.kyc_status IN ('approved', 'rejected') AND OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
            RAISE EXCEPTION 'Unauthorized: Merchants cannot approve or reject their own KYC.';
        END IF;
    END IF;

    IF public.get_admin_role()::text IS DISTINCT FROM 'super_admin' THEN
        NEW.is_verified = OLD.is_verified;
        IF NEW.kyc_status = 'approved' AND OLD.kyc_status IS DISTINCT FROM 'approved' THEN
            RAISE EXCEPTION 'Unauthorized: Only Super Admins can approve shop KYC.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

-- Function: ctm_get_security_radar_insights
CREATE OR REPLACE FUNCTION public.ctm_get_security_radar_insights()
 RETURNS TABLE(fingerprint_type text, fingerprint_value text, occurrence_count bigint, associated_emails text[], associated_shops text[], is_banned boolean, risk_level text, account_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. Authorization check
  IF NOT public.is_staff_member() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH all_registrations AS (
    -- Collect registration fingerprints from both Profiles and Shops
    -- Profiles
    SELECT 
      u.email, 
      p.creation_ip, 
      p.creation_device, 
      NULL::text as shop_name
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE (p.creation_ip IS NOT NULL AND p.creation_ip <> 'Unknown IP' AND length(p.creation_ip) > 6)
       OR (p.creation_device IS NOT NULL AND p.creation_device <> 'Unknown Device')
    
    UNION ALL

    -- Shops
    SELECT 
      u.email, 
      s.creation_ip, 
      s.creation_device, 
      s.name as shop_name
    FROM public.shops s
    JOIN auth.users u ON u.id = s.owner_id
    WHERE (s.creation_ip IS NOT NULL AND s.creation_ip <> 'Unknown IP' AND length(s.creation_ip) > 6)
       OR (s.creation_device IS NOT NULL AND s.creation_device <> 'Unknown Device')
  ),
  ip_clusters AS (
    -- Group by IP Address
    SELECT
      'IP Address'::text as f_type,
      creation_ip as f_value,
      count(DISTINCT email)::bigint as occurrences,
      array_agg(DISTINCT email)::text[] as emails,
      array_agg(DISTINCT shop_name) FILTER (WHERE shop_name IS NOT NULL)::text[] as shops,
      jsonb_agg(DISTINCT jsonb_build_object(
        'email', email,
        'shops', (SELECT jsonb_agg(name) FROM public.shops WHERE owner_id = (SELECT id FROM auth.users WHERE email = all_registrations.email LIMIT 1))
      )) as data_payload
    FROM all_registrations
    WHERE creation_ip IS NOT NULL AND creation_ip <> 'Unknown IP'
    GROUP BY creation_ip
    HAVING count(DISTINCT email) > 1
  ),
  device_clusters AS (
    -- Group by Device Signature
    SELECT
      'Device Signature'::text as f_type,
      creation_device as f_value,
      count(DISTINCT email)::bigint as occurrences,
      array_agg(DISTINCT email)::text[] as emails,
      array_agg(DISTINCT shop_name) FILTER (WHERE shop_name IS NOT NULL)::text[] as shops,
      jsonb_agg(DISTINCT jsonb_build_object(
        'email', email,
        'ip', creation_ip,
        'shops', (SELECT jsonb_agg(name) FROM public.shops WHERE owner_id = (SELECT id FROM auth.users WHERE email = all_registrations.email LIMIT 1))
      )) as data_payload
    FROM all_registrations
    WHERE creation_device IS NOT NULL AND creation_device <> 'Unknown Device'
    GROUP BY creation_device
    HAVING count(DISTINCT email) > 1
  ),
  combined AS (
    SELECT * FROM ip_clusters
    UNION ALL
    SELECT * FROM device_clusters
  )
  SELECT
    c.f_type,
    c.f_value,
    c.occurrences,
    c.emails,
    c.shops,
    EXISTS (SELECT 1 FROM public.ip_blacklist bl WHERE bl.ip_address = c.f_value) as is_banned,
    CASE 
      WHEN c.occurrences >= 5 THEN 'CRITICAL'
      WHEN c.occurrences >= 3 THEN 'HIGH'
      ELSE 'MEDIUM'
    END as risk_level,
    c.data_payload as account_data
  FROM combined c
  ORDER BY c.occurrences DESC;
END;
$function$
;

-- Function: send_city_notification
CREATE OR REPLACE FUNCTION public.send_city_notification(p_city_id bigint, p_title text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, title, message)
  SELECT id, p_title, p_message
  FROM public.profiles
  WHERE city_id = p_city_id;
END;
$function$
;

-- Function: is_subscription_active
CREATE OR REPLACE FUNCTION public.is_subscription_active(shop_row shops)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT shop_row.subscription_end_date > now();
$function$
;

-- Function: protect_product_admin_columns
CREATE OR REPLACE FUNCTION public.protect_product_admin_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF public.get_admin_role() IS NULL THEN
        -- === INSERT SECURITY ===
        IF TG_OP = 'INSERT' THEN
            NEW.is_approved = false;
            NEW.rejection_reason = NULL;
            
        -- === UPDATE SECURITY ===
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.is_approved = true AND OLD.is_approved = false THEN
                NEW.is_approved = false;
            END IF;
            
            IF (NEW.name IS DISTINCT FROM OLD.name) OR 
               (NEW.description IS DISTINCT FROM OLD.description) OR 
               (NEW.image_url IS DISTINCT FROM OLD.image_url) OR
               (NEW.image_url_2 IS DISTINCT FROM OLD.image_url_2) OR
               (NEW.image_url_3 IS DISTINCT FROM OLD.image_url_3) 
            THEN
                NEW.is_approved = false;
                NEW.rejection_reason = NULL;
            END IF;
            
            NEW.shop_id = OLD.shop_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

-- Function: match_products
CREATE OR REPLACE FUNCTION public.match_products(search_text text, match_limit integer)
 RETURNS TABLE(product_name text, product_price numeric, shop_category text, shop_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  return query
  select 
    p.name::text as product_name,
    p.price::numeric as product_price,
    coalesce(s.category, '')::text as shop_category,
    s.name::text as shop_name
  from products p
  join shops s on p.shop_id = s.id
  where 
    p.is_available = true
    and (
      p.name ilike '%' || search_text || '%'
      or
      p.description ilike '%' || search_text || '%'
    )
  order by p.price asc
  limit match_limit;
end;
$function$
;

-- Function: get_public_profiles
CREATE OR REPLACE FUNCTION public.get_public_profiles(profile_ids uuid[])
 RETURNS TABLE(id uuid, full_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.full_name,
    p.avatar_url
  from public.profiles p
  where p.id = any(profile_ids);
$function$
;

-- Function: get_network_info
CREATE OR REPLACE FUNCTION public.get_network_info()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
   _headers json;
   _norm_headers jsonb;
   _ip text;
   _country text;
   _is_banned boolean;
   _key text;
   _val text;
BEGIN
   BEGIN
     _headers := current_setting('request.headers', true)::json;
     _norm_headers := '{}'::jsonb;
     IF _headers IS NOT NULL THEN
       FOR _key, _val IN SELECT * FROM json_each_text(_headers) LOOP
         _norm_headers := _norm_headers || jsonb_build_object(lower(_key), _val);
       END LOOP;
     END IF;
   EXCEPTION WHEN OTHERS THEN
     _norm_headers := '{}'::jsonb;
   END;
   
   _ip := coalesce(
     _norm_headers->>'cf-connecting-ip',
     _norm_headers->>'x-forwarded-for',
     _norm_headers->>'x-real-ip',
     _norm_headers->>'x-client-ip',
     _norm_headers->>'true-client-ip'
   );
   _country := coalesce(_norm_headers->>'cf-ipcountry', _norm_headers->>'x-country-code');      
   
   if _ip is not null and position(',' in _ip) > 0 then
     _ip := trim(split_part(_ip, ',', 1));
   end if;

   SELECT EXISTS (SELECT 1 FROM public.ip_blacklist WHERE ip_address = _ip) INTO _is_banned;    

   RETURN json_build_object(
     'ip', coalesce(_ip, 'Unknown IP'), 
     'country', coalesce(_country, 'Unknown'),
     'is_banned', coalesce(_is_banned, false)
   );
END;
$function$
;

-- Function: redeem_verification_promo_code
CREATE OR REPLACE FUNCTION public.redeem_verification_promo_code(p_merchant_id uuid, p_code text, p_merchant_name text, p_shop_name text, p_city_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_promo record;
  v_payment_ref text;
BEGIN
  v_payment_ref := 'PROMO_' || p_code;

  -- 1. Check if it was already redeemed (Idempotency)
  IF EXISTS (SELECT 1 FROM public.physical_verification_payments WHERE payment_ref = v_payment_ref) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Promo code already verified.');
  END IF;

  -- 2. ROW-LEVEL LOCK: Grab the promo code and lock it
  SELECT * INTO v_promo
  FROM public.promo_codes
  WHERE code = p_code AND is_used = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used promo code.';
  END IF;

  -- 3. Consume the Promo Code
  UPDATE public.promo_codes
  SET is_used = true,
      used_by = p_merchant_id,
      used_at = now()
  WHERE code = p_code;

  -- 4. Generate the Verification Receipt (Amount is 0 for Promos)
  INSERT INTO public.physical_verification_payments (
    merchant_id, merchant_name, shop_name, city, amount, payment_ref, status
  ) VALUES (
    p_merchant_id, p_merchant_name, p_shop_name, p_city_name, 0, v_payment_ref, 'success'
  );

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Promo code successfully redeemed and verification recorded.'
  );
END;
$function$
;

-- Function: set_login_security_guards_updated_at
CREATE OR REPLACE FUNCTION public.set_login_security_guards_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$function$
;

-- Function: normalize_login_guard_email
CREATE OR REPLACE FUNCTION public.normalize_login_guard_email(p_email text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select lower(trim(coalesce(p_email, '')));
$function$
;

-- Function: set_offline_payment_proofs_updated_at
CREATE OR REPLACE FUNCTION public.set_offline_payment_proofs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- Function: protect_banner_news_admin_columns
CREATE OR REPLACE FUNCTION public.protect_banner_news_admin_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Check if the user making the update is NOT an admin
    IF public.get_admin_role() IS NULL THEN
        
        -- === INSERT SECURITY ===
        IF TG_OP = 'INSERT' THEN
            -- Merchants can NEVER insert an already-approved banner/news
            NEW.status = 'pending';
            
        -- === UPDATE SECURITY ===
        ELSIF TG_OP = 'UPDATE' THEN
            
            -- Prevent merchants from approving their own pending/rejected items
            IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
                NEW.status = 'pending';
            END IF;
            
            -- If they alter the actual text or image, automatically revoke approval
            IF NEW.content_data IS DISTINCT FROM OLD.content_data THEN
                NEW.status = 'pending';
            END IF;
            
            -- Lock ownership IDs so they can't assign it to another shop
            NEW.shop_id = OLD.shop_id;
            NEW.merchant_id = OLD.merchant_id;
            
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$function$
;

-- Function: update_sponsored_products_updated_at
CREATE OR REPLACE FUNCTION public.update_sponsored_products_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: ctm_log_login_guard_debug
CREATE OR REPLACE FUNCTION public.ctm_log_login_guard_debug(p_event_type text, p_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
   -- We no longer store these logs to save space and protect privacy.
   RETURN;
END;
$function$
;

-- Function: ctm_get_login_guard_status
CREATE OR REPLACE FUNCTION public.ctm_get_login_guard_status(p_email text)
 RETURNS TABLE(email text, user_id uuid, failed_attempts integer, attempts_remaining integer, is_suspended boolean, suspended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  normalized_email text := public.normalize_login_guard_email(p_email);
  existing_guard public.login_security_guards%rowtype;
  matched_user_id uuid;
begin
  perform public.ctm_log_login_guard_debug(
    'status:start',
    normalized_email,
    null,
    jsonb_build_object('raw_email', p_email)
  );

  if normalized_email = '' then
    perform public.ctm_log_login_guard_debug(
      'status:empty-email',
      normalized_email,
      null,
      '{}'::jsonb
    );
    return query
    select
      null::text,
      null::uuid,
      0,
      3,
      false,
      null::timestamp with time zone;
    return;
  end if;

  select *
  into existing_guard
  from public.login_security_guards
  where login_security_guards.email = normalized_email;

  select users.id
  into matched_user_id
  from auth.users
  where lower(users.email) = normalized_email
  limit 1;

  perform public.ctm_log_login_guard_debug(
    'status:resolved',
    normalized_email,
    coalesce(existing_guard.user_id, matched_user_id),
    jsonb_build_object(
      'has_guard_row', existing_guard.email is not null,
      'failed_attempts', coalesce(existing_guard.failed_attempts, 0),
      'is_suspended', coalesce(existing_guard.suspended_at is not null, false)
    )
  );

  return query
  select
    normalized_email,
    coalesce(existing_guard.user_id, matched_user_id),
    coalesce(existing_guard.failed_attempts, 0),
    greatest(0, 3 - coalesce(existing_guard.failed_attempts, 0)),
    coalesce(existing_guard.suspended_at is not null, false),
    existing_guard.suspended_at;
end;
$function$
;

-- Function: ctm_register_wrong_password_attempt
CREATE OR REPLACE FUNCTION public.ctm_register_wrong_password_attempt(p_email text)
 RETURNS TABLE(email text, user_id uuid, failed_attempts integer, attempts_remaining integer, is_suspended boolean, suspended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  normalized_email text := public.normalize_login_guard_email(p_email);
  matched_user_id uuid;
  guard_row public.login_security_guards%rowtype;
begin
  -- Search for the user first
  select users.id into matched_user_id
  from auth.users
  where lower(users.email) = normalized_email
  limit 1;

  -- CRITICAL: If the user doesn't exist, stop here. 
  -- We return a "fake" successful status to the frontend to avoid leaking account existence
  -- but we DO NOT insert anything into our security table.
  if matched_user_id is null then
    return query select normalized_email, null::uuid, 0, 3, false, null::timestamp with time zone;
    return;
  end if;

  -- User exists, proceed with tracking
  insert into public.login_security_guards (
    email, user_id, failed_attempts, last_failed_at
  )
  values (
    normalized_email, matched_user_id, 1, timezone('utc'::text, now())
  )
  on conflict (email) do update
  set
    user_id = coalesce(excluded.user_id, public.login_security_guards.user_id),
    failed_attempts = case
      when public.login_security_guards.suspended_at is not null then greatest(public.login_security_guards.failed_attempts, 3)
      else least(public.login_security_guards.failed_attempts + 1, 3)
    end,
    last_failed_at = timezone('utc'::text, now()),
    suspended_at = case
      when public.login_security_guards.suspended_at is not null then public.login_security_guards.suspended_at
      when public.login_security_guards.failed_attempts + 1 >= 3 then timezone('utc'::text, now())
      else null
    end,
    suspension_reason = case
      when public.login_security_guards.suspended_at is not null then coalesce(public.login_security_guards.suspension_reason, 'too_many_wrong_password_attempts')
      when public.login_security_guards.failed_attempts + 1 >= 3 then 'too_many_wrong_password_attempts'
      else null
    end
  returning * into guard_row;

  return query
  select
    guard_row.email, guard_row.user_id, guard_row.failed_attempts,
    greatest(0, 3 - guard_row.failed_attempts),
    guard_row.suspended_at is not null,
    guard_row.suspended_at;
end;
$function$
;

-- Function: stamp_profile_footprint
CREATE OR REPLACE FUNCTION public.stamp_profile_footprint()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _uid uuid;
  _net json;
  _headers json;
  _ua text;
BEGIN
  -- 1. Securely get the ID of the user making the request
  _uid := (SELECT auth.uid());
  
  -- If not logged in, abort silently
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  -- 2. Grab the network info and device signature
  _net := public.get_network_info();
  
  BEGIN
    _headers := current_setting('request.headers', true)::json;
    _ua := _headers->>'user-agent';
  EXCEPTION WHEN OTHERS THEN
    _ua := null;
  END;

  -- 3. Explicitly update ONLY the user's footprint, and ONLY if it's empty
  UPDATE public.profiles
  SET 
    creation_ip = COALESCE(creation_ip, _net->>'ip'),
    creation_device = COALESCE(creation_device, _ua),
    ip_country = COALESCE(ip_country, _net->>'country')
  WHERE id = _uid 
    AND creation_ip IS NULL;
END;
$function$
;

-- Function: set_featured_city_banners_updated_at
CREATE OR REPLACE FUNCTION public.set_featured_city_banners_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- Function: handle_new_user_registration
CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _full_name text;
  _phone text;
  _city_id bigint;
  _area_id bigint;
BEGIN
  -- Extract metadata provided during signUp
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _phone := NEW.raw_user_meta_data->>'phone';
  
  -- 🚀 THE FIX: Convert empty strings (or whitespace) to true NULL
  -- This prevents Postgres from triggering a UNIQUE collision on empty strings!
  IF trim(_phone) = '' THEN
    _phone := NULL;
  END IF;

  -- 🚀 SAFETY NET: Also safely handle empty strings for city and area IDs
  _city_id := NULLIF(NEW.raw_user_meta_data->>'city_id', '')::bigint;
  _area_id := NULLIF(NEW.raw_user_meta_data->>'area_id', '')::bigint;

  -- Insert into public.profiles
  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    city_id,
    area_id
  )
  VALUES (
    NEW.id,
    _full_name,
    _phone,
    _city_id,
    _area_id
  );

  RETURN NEW;

EXCEPTION
  WHEN unique_violation THEN
    -- Specifically catch duplicate phone numbers (or IDs)
    RAISE EXCEPTION 'A user with this phone number already exists.' USING ERRCODE = '23505';
  WHEN OTHERS THEN
    -- Catch all other errors to prevent silent registration failures
    RAISE EXCEPTION 'Profile creation failed: %', SQLERRM;
END;
$function$
;

-- Function: staff_user_activity_summary
CREATE OR REPLACE FUNCTION public.staff_user_activity_summary(p_inactive_days integer DEFAULT 180, p_city_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(user_id uuid, email text, full_name text, city_id bigint, city_name text, state_name text, account_created_at timestamp with time zone, last_sign_in_at timestamp with time zone, last_seen_at timestamp with time zone, inactivity_days integer, is_inactive boolean, is_suspended boolean, guard_suspended_at timestamp with time zone, guard_suspension_reason text, shop_count integer, shops jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_staff_member() then
    raise exception 'Access denied'
      using errcode = '42501';
  end if;

  return query
  with shop_rollup as (
    select
      s.owner_id,
      count(*)::integer as shop_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'shop_id', s.id,
            'shop_name', s.name,
            'unique_id', s.unique_id,
            'status', s.status,
            'is_open', s.is_open,
            'city_id', s.city_id
          )
          order by s.created_at desc
        ) filter (where s.id is not null),
        '[]'::jsonb
      ) as shops
    from public.shops s
    group by s.owner_id
  )
  select
    u.id as user_id,
    u.email::text as email,
    p.full_name,
    p.city_id,
    c.name as city_name,
    c.state as state_name,
    u.created_at as account_created_at,
    u.last_sign_in_at,
    coalesce(u.last_sign_in_at, u.created_at) as last_seen_at,
    greatest(
      floor(
        extract(epoch from (now() - coalesce(u.last_sign_in_at, u.created_at))) / 86400
      )::integer,
      0
    ) as inactivity_days,
    (
      coalesce(u.last_sign_in_at, u.created_at)
      <= now() - make_interval(days => greatest(coalesce(p_inactive_days, 180), 1))
    ) as is_inactive,
    (coalesce(p.is_suspended, false) or lsg.suspended_at is not null) as is_suspended,
    lsg.suspended_at as guard_suspended_at,
    lsg.suspension_reason as guard_suspension_reason,
    coalesce(sr.shop_count, 0) as shop_count,
    coalesce(sr.shops, '[]'::jsonb) as shops
  from auth.users u
  left join public.profiles p
    on p.id = u.id
  left join public.cities c
    on c.id = p.city_id
  left join shop_rollup sr
    on sr.owner_id = u.id
  left join public.staff_profiles sp
    on sp.id = u.id
  left join public.login_security_guards lsg
    on lsg.email = lower(u.email)
  where sp.id is null
    and u.email is not null
    and (p_city_id is null or p.city_id = p_city_id)
  order by
    (
      coalesce(u.last_sign_in_at, u.created_at)
      <= now() - make_interval(days => greatest(coalesce(p_inactive_days, 180), 1))
    ) desc,
    coalesce(u.last_sign_in_at, u.created_at) asc,
    u.created_at desc;
end;
$function$
;

-- Function: ctm_reinstate_login_guard
CREATE OR REPLACE FUNCTION public.ctm_reinstate_login_guard(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff_member() then
    raise exception 'Access denied'
      using errcode = '42501';
  end if;

  update public.login_security_guards
  set
    failed_attempts = 0,
    suspended_at = null,
    suspension_reason = null,
    updated_at = now()
  where email = lower(trim(p_email));

  if not found then
    return false;
  end if;

  perform public.ctm_log_login_guard_debug(
    'reinstate:success',
    p_email,
    null,
    jsonb_build_object('by_staff', auth.uid())
  );

  return true;
end;
$function$
;

-- Function: process_offline_payment_review
CREATE OR REPLACE FUNCTION public.process_offline_payment_review(p_proof_id bigint, p_staff_id uuid, p_action text, p_note text, p_payment_ref text DEFAULT NULL::text, p_amount numeric DEFAULT NULL::numeric, p_plan_key text DEFAULT NULL::text, p_new_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_merchant_name text DEFAULT NULL::text, p_shop_name text DEFAULT NULL::text, p_city_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_proof record;
  v_existing_physical record;
  v_final_ref text;
BEGIN
  -- 1. ROW-LEVEL LOCK
  SELECT * INTO v_proof
  FROM public.offline_payment_proofs
  WHERE id = p_proof_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment proof not found.';
  END IF;

  IF v_proof.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true, 
      'idempotent', true, 
      'status', v_proof.status, 
      'message', 'Payment proof is already ' || v_proof.status
    );
  END IF;

  -- 2. HANDLE REJECTION
  IF p_action = 'reject' THEN
    UPDATE public.offline_payment_proofs
    SET status = 'rejected',
        review_note = p_note,
        reviewed_by = p_staff_id,
        reviewed_at = now()
    WHERE id = p_proof_id;

    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'message', 'Payment proof rejected.');
  END IF;

  -- 3. HANDLE APPROVAL
  IF p_action = 'approve' THEN
    v_final_ref := p_payment_ref;

    -- A. Physical Verification Flow
    IF v_proof.payment_kind = 'physical_verification' THEN
      SELECT * INTO v_existing_physical
      FROM public.physical_verification_payments
      WHERE merchant_id = v_proof.merchant_id AND status = 'success'
      ORDER BY id DESC LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO public.physical_verification_payments (
          merchant_id, merchant_name, shop_name, city, amount, payment_ref, status
        ) VALUES (
          v_proof.merchant_id, p_merchant_name, p_shop_name, p_city_name, p_amount, v_final_ref, 'success'
        );
      ELSE
        v_final_ref := v_existing_physical.payment_ref;
      END IF;

    -- B. Service Fee (Subscription) Flow
    ELSIF v_proof.payment_kind = 'service_fee' THEN
      
      -- Update Shop (Removed the missing is_subscription_active column!)
      UPDATE public.shops
      SET subscription_plan = p_plan_key,
          subscription_end_date = p_new_end_date
      WHERE id = v_proof.shop_id AND owner_id = v_proof.merchant_id;

      -- Create Receipt
      INSERT INTO public.service_fee_payments (
        merchant_id, shop_id, amount, plan, payment_ref, status
      ) VALUES (
        v_proof.merchant_id, v_proof.shop_id, p_amount, p_plan_key, v_final_ref, 'success'
      );
    ELSE
      RAISE EXCEPTION 'Unknown payment kind: %', v_proof.payment_kind;
    END IF;

    -- Finalize Proof Status
    UPDATE public.offline_payment_proofs
    SET status = 'approved',
        review_note = COALESCE(p_note, 'Payment confirmed by staff.'),
        reviewed_by = p_staff_id,
        reviewed_at = now(),
        approval_payment_ref = v_final_ref
    WHERE id = p_proof_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'approved',
      'paymentRef', v_final_ref,
      'plan', p_plan_key,
      'subscriptionEndDate', p_new_end_date,
      'message', 'Payment proof approved successfully.'
    );
  END IF;

  RAISE EXCEPTION 'Invalid action parameter.';
END;
$function$
;

-- Function: check_repo_search_rate_limit
CREATE OR REPLACE FUNCTION public.check_repo_search_rate_limit(p_key_hash text, p_term_hash text DEFAULT NULL::text, p_window_seconds integer DEFAULT 60, p_max_requests integer DEFAULT 15, p_cooldown_seconds integer DEFAULT 180, p_max_cooldown_seconds integer DEFAULT 3600)
 RETURNS TABLE(allowed boolean, retry_after_seconds integer, blocked_until timestamp with time zone, request_count integer, violation_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_row public.repo_search_rate_limits%rowtype;
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
  v_next_count integer;
  v_next_violation_count integer;
  v_cooldown_seconds integer;
  v_blocked_until timestamptz;
  v_past timestamptz := v_now - interval '1 year';
begin
  if coalesce(p_key_hash, '') = '' then
    return query select false, 180, v_now + interval '3 minutes', 0, 0;
    return;
  end if;

  insert into public.repo_search_rate_limits (
    key_hash, window_started_at, request_count, blocked_until,
    violation_count, last_request_at, last_term_hash
  )
  values (p_key_hash, v_past, 0, null, 0, v_past, p_term_hash)
  on conflict (key_hash) do nothing;

  select * into v_row from public.repo_search_rate_limits where key_hash = p_key_hash for update;

  -- If currently blocked, return remaining time
  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query
      select false, 
             greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer),
             v_row.blocked_until, v_row.request_count, v_row.violation_count;
    return;
  end if;

  -- Logic simplification: Reset violation count if the user has been "clean" for 10 minutes
  -- This prevents the cooldown from increasing indefinitely over days of normal use.
  v_next_violation_count := v_row.violation_count;
  if v_row.last_request_at < v_now - interval '10 minutes' then
    v_next_violation_count := 0;
  end if;

  -- Normal Window Reset
  if v_row.window_started_at <= v_now - v_window then
    update public.repo_search_rate_limits
    set window_started_at = v_now,
        request_count = 1,
        blocked_until = null,
        last_request_at = v_now,
        last_term_hash = p_term_hash,
        violation_count = v_next_violation_count
    where key_hash = p_key_hash;

    return query select true, 0, null::timestamptz, 1, v_next_violation_count;
    return;
  end if;

  v_next_count := v_row.request_count + 1;

  -- Standard Rate Limit Trigger
  if v_next_count > greatest(p_max_requests, 1) then
    v_next_violation_count := v_next_violation_count + 1;
    
    -- Simplified escalation logic:
    -- 1-19 violations: 3 minutes (180s)
    -- 20-29 violations: 1 hour (3600s)
    -- 30+ violations: 24 hours (86400s)
    if v_next_violation_count >= 30 then
        v_cooldown_seconds := 86400;
    elsif v_next_violation_count >= 20 then
        v_cooldown_seconds := 3600;
    else
        v_cooldown_seconds := 180;
    end if;

    v_blocked_until := v_now + make_interval(secs => v_cooldown_seconds);

    update public.repo_search_rate_limits
    set request_count = v_next_count,
        violation_count = v_next_violation_count,
        blocked_until = v_blocked_until,
        last_request_at = v_now,
        last_term_hash = p_term_hash
    where key_hash = p_key_hash;

    return query
      select false, v_cooldown_seconds, v_blocked_until, v_next_count, v_next_violation_count;
    return;
  end if;

  -- Normal request update
  update public.repo_search_rate_limits
  set request_count = v_next_count,
      blocked_until = null,
      last_request_at = v_now,
      last_term_hash = p_term_hash,
      violation_count = v_next_violation_count
  where key_hash = p_key_hash;

  return query select true, 0, null::timestamptz, v_next_count, v_next_violation_count;
end;
$function$
;

-- Function: cleanup_repo_search_rate_limits
CREATE OR REPLACE FUNCTION public.cleanup_repo_search_rate_limits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted integer;
begin
  delete from public.repo_search_rate_limits
  where last_request_at < now() - interval '14 days'
    and (blocked_until is null or blocked_until < now() - interval '1 day');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$
;

-- Function: ctm_staff_update_user_status
CREATE OR REPLACE FUNCTION public.ctm_staff_update_user_status(p_user_id uuid, p_email text, p_suspend boolean, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_normalized_email text;
BEGIN
  -- 1. Security Check
  IF NOT public.is_staff_member() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  v_normalized_email := lower(trim(p_email));

  -- 2. Update Profile
  UPDATE public.profiles
  SET 
    is_suspended = p_suspend
  WHERE id = p_user_id;

  -- 3. Handle Login Security Guards
  IF p_suspend THEN
    -- Upsert suspension into login_security_guards
    INSERT INTO public.login_security_guards (
      email,
      user_id,
      failed_attempts,
      suspended_at,
      suspension_reason,
      updated_at
    )
    VALUES (
      v_normalized_email,
      p_user_id,
      10, -- High number to keep it locked
      now(),
      COALESCE(p_reason, 'Manual staff suspension'),
      now()
    )
    ON CONFLICT (email) DO UPDATE
    SET
      failed_attempts = GREATEST(login_security_guards.failed_attempts, 10),
      suspended_at = now(),
      suspension_reason = COALESCE(p_reason, 'Manual staff suspension'),
      updated_at = now();
  ELSE
    -- Reinstatement
    UPDATE public.login_security_guards
    SET
      failed_attempts = 0,
      suspended_at = NULL,
      suspension_reason = NULL,
      updated_at = now()
    WHERE email = v_normalized_email;
  END IF;

  -- 4. Log Debug
  PERFORM public.ctm_log_login_guard_debug(
    CASE WHEN p_suspend THEN 'staff_suspend' ELSE 'staff_reinstate' END,
    p_email,
    p_user_id,
    jsonb_build_object('by_staff', auth.uid(), 'reason', p_reason)
  );

  RETURN TRUE;
END;
$function$
;

-- Function: ctm_reset_login_guard_after_success
CREATE OR REPLACE FUNCTION public.ctm_reset_login_guard_after_success(p_email text)
 RETURNS TABLE(email text, user_id uuid, failed_attempts integer, attempts_remaining integer, is_suspended boolean, suspended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  normalized_email text := public.normalize_login_guard_email(p_email);
  matched_user_id uuid;
  guard_row public.login_security_guards%rowtype;
begin
  perform public.ctm_log_login_guard_debug(
    'reset:start',
    normalized_email,
    null,
    jsonb_build_object('raw_email', p_email)
  );

  if normalized_email = '' then
    perform public.ctm_log_login_guard_debug(
      'reset:empty-email',
      normalized_email,
      null,
      '{}'::jsonb
    );
    raise exception 'Email is required for login reset.';
  end if;

  select users.id
  into matched_user_id
  from auth.users
  where lower(users.email) = normalized_email
  limit 1;

  insert into public.login_security_guards (
    email,
    user_id,
    failed_attempts,
    last_success_at
  )
  values (
    normalized_email,
    matched_user_id,
    0,
    timezone('utc'::text, now())
  )
  on conflict on constraint login_security_guards_pkey do update
  set
    user_id = coalesce(excluded.user_id, public.login_security_guards.user_id),
    -- FIX: Always reset failed_attempts and last_failed_at on success 
    -- UNLESS the user is currently suspended. If they are suspended, 
    -- they shouldn't even be able to login successfully, but if they do 
    -- (e.g. staff action or bypass), we keep the record of suspension 
    -- until explicitly reinstated.
    failed_attempts = case
      when public.login_security_guards.suspended_at is null then 0
      else public.login_security_guards.failed_attempts
    end,
    last_failed_at = case
      when public.login_security_guards.suspended_at is null then null
      else public.login_security_guards.last_failed_at
    end,
    last_success_at = timezone('utc'::text, now())
  returning *
  into guard_row;

  perform public.ctm_log_login_guard_debug(
    'reset:success',
    guard_row.email,
    guard_row.user_id,
    jsonb_build_object(
      'failed_attempts', guard_row.failed_attempts,
      'attempts_remaining', greatest(0, 3 - guard_row.failed_attempts),
      'is_suspended', guard_row.suspended_at is not null
    )
  );

  return query
  select
    guard_row.email,
    guard_row.user_id,
    guard_row.failed_attempts,
    greatest(0, 3 - guard_row.failed_attempts),
    guard_row.suspended_at is not null,
    guard_row.suspended_at;
end;
$function$
;

-- Function: set_shop_comments_updated_at
CREATE OR REPLACE FUNCTION public.set_shop_comments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- Function: is_staff_user
CREATE OR REPLACE FUNCTION public.is_staff_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
  );
$function$
;

-- Function: handle_profile_network_info
CREATE OR REPLACE FUNCTION public.handle_profile_network_info()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _net json;
  _ua text;
BEGIN
  -- ABSOLUTE SAFETY: Ensure this trigger NEVER blocks an INSERT
  BEGIN
    _net := public.get_network_info();
    
    BEGIN
      SELECT value INTO _ua FROM json_each_text(current_setting('request.headers', true)::json) 
      WHERE lower(key) = 'user-agent' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN _ua := 'Unknown Device'; END;

    IF (TG_OP = 'INSERT') THEN
      NEW.creation_ip := coalesce(_net->>'ip', 'Unknown IP');
      NEW.ip_country := coalesce(_net->>'country', 'Unknown');
      NEW.creation_device := coalesce(_ua, 'Unknown Device');
    ELSIF (TG_OP = 'UPDATE') THEN
      IF (_net->>'ip' <> 'Unknown IP') THEN
        NEW.ip_country := coalesce(_net->>'country', NEW.ip_country);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to defaults on error
    IF (TG_OP = 'INSERT') THEN
       NEW.creation_ip := 'Unknown IP';
       NEW.ip_country := 'Unknown';
       NEW.creation_device := 'Unknown Device';
    END IF;
  END;

  RETURN NEW;
END;
$function$
;

-- Function: is_staff_member
CREATE OR REPLACE FUNCTION public.is_staff_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
  );
$function$
;

-- Function: prevent_immutable_column_changes
CREATE OR REPLACE FUNCTION public.prevent_immutable_column_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  column_name text;
  old_value text;
  new_value text;
begin
  foreach column_name in array tg_argv loop
    old_value := to_jsonb(old) ->> column_name;
    new_value := to_jsonb(new) ->> column_name;

    if new_value is distinct from old_value then
      raise exception '% cannot be changed after creation on table %.',
        column_name,
        tg_table_name
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$function$
;

-- Function: record_site_visit
CREATE OR REPLACE FUNCTION public.record_site_visit(p_session_key text DEFAULT NULL::text, p_visitor_key text DEFAULT NULL::text, p_page_path text DEFAULT NULL::text, p_referrer_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_authenticated boolean := auth.uid() is not null;
  v_today date := (timezone('Africa/Lagos', now()))::date;
begin
  -- Upsert daily total: Insert 1, or add 1 to existing
  insert into public.daily_site_visits (visit_date, total_visits, authenticated_visits)
  values (
    v_today,
    1,
    case when v_is_authenticated then 1 else 0 end
  )
  on conflict (visit_date) do update
  set
    total_visits = daily_site_visits.total_visits + 1,
    authenticated_visits = daily_site_visits.authenticated_visits + (case when v_is_authenticated then 1 else 0 end);
end;
$function$
;

-- Function: staff_site_visit_top_pages
CREATE OR REPLACE FUNCTION public.staff_site_visit_top_pages(p_days integer DEFAULT 30, p_limit integer DEFAULT 8)
 RETURNS TABLE(page_path text, total_visits bigint, unique_visitors bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff_member() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  -- Return nothing. Page-level tracking is disabled for bandwidth optimization.
  return query
  select null::text, 0::bigint, 0::bigint
  where false;
end;
$function$
;

