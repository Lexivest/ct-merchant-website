CREATE OR REPLACE FUNCTION public.notify_shop_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_name text := CASE WHEN coalesce(NEW.is_service, false) THEN 'service' ELSE 'shop' END;
  v_entity_title text := CASE WHEN coalesce(NEW.is_service, false) THEN 'Service' ELSE 'Shop' END;
  v_business_name text := coalesce(nullif(trim(NEW.name), ''), 'your ' || v_entity_name);
  v_reason text := nullif(trim(coalesce(NEW.rejection_reason, '')), '');
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        v_entity_title || ' Application Approved',
        '"' || v_business_name || '" has passed application review. You can now open your vendor dashboard, manage your listing, and continue with physical verification.',
        'shop_approved',
        '/vendor-panel'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        v_entity_title || ' Application Needs Attention',
        'We could not approve "' || v_business_name || '" yet.'
        || CASE
            WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason || '.'
            ELSE ''
           END
        || ' Please review your details, correct the required documents, and submit again.',
        'shop_rejected',
        '/shop-registration?id=' || NEW.id::text
      );
    END IF;
  END IF;

  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    IF NEW.kyc_status = 'approved' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        'Video KYC Approved',
        '"' || v_business_name || '" has passed physical verification. Your verified tools are now unlocked and your free trial is active.',
        'kyc_approved',
        '/vendor-panel'
      );
    ELSIF NEW.kyc_status = 'rejected' THEN
      PERFORM public.push_user_notification(
        NEW.owner_id,
        'Video KYC Needs Attention',
        'Your video KYC for "' || v_business_name || '" was not approved.'
        || CASE
            WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason || '.'
            ELSE ''
           END
        || ' Please record a clearer video at your registered business location and submit again.',
        'kyc_rejected',
        '/merchant-video-kyc?shop_id=' || NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
