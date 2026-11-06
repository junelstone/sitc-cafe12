-- Allow sales charged to a customer account.
alter table public.sales drop constraint sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check check (payment_method in ('cash','mobile_money','account'));
