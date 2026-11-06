-- Fixed search_path on helper functions; the old record_sale is replaced by record_sale2.
alter function public.session_price(integer, integer) set search_path = public;
alter function public._jobs_guard() set search_path = public;
alter function public._customers_guard() set search_path = public;
revoke execute on function public.record_sale(jsonb,text,text,integer,integer,text,text) from authenticated;
