import { createContext, useContext } from 'react'

/** Every permission a role/account can be given. Order = order in the permissions table. */
export const PERMS = [
  { key: 'entry_production', label: 'ثبت روزانهٔ تولید و حضور', group: 'ثبت روزانه' },
  { key: 'entry_sales', label: 'ثبت روزانهٔ فروش', group: 'ثبت روزانه' },
  { key: 'settings', label: 'تغییر ساعت‌های کاری پیش‌فرض', group: 'ثبت روزانه' },
  { key: 'staff', label: 'افزودن و ویرایش کارکنان', group: 'اطلاعات پایه' },
  { key: 'staff_delete', label: 'حذف کارکنان', group: 'اطلاعات پایه' },
  { key: 'catalog', label: 'محصولات، انواع محصول و عملیات‌ها', group: 'اطلاعات پایه' },
  { key: 'standards', label: 'دیدن و تغییر زمان استاندارد', group: 'اطلاعات پایه' },
  { key: 'customers', label: 'مشتریان', group: 'اطلاعات پایه' },
  { key: 'reports_staff', label: 'گزارش کارکنان (بهره‌وری، حضور، اضافه‌کار)', group: 'گزارش‌ها' },
  { key: 'reports_production', label: 'گزارش تولید', group: 'گزارش‌ها' },
  { key: 'reports_sales', label: 'گزارش فروش', group: 'گزارش‌ها' },
  { key: 'users', label: 'مدیریت حساب‌ها و نقش‌ها', group: 'مدیریت' },
  { key: 'data_purge', label: 'پاک‌سازی داده‌ها', group: 'مدیریت' },
]

export const AccessCtx = createContext({ perms: [], is_manager: false, role: '' })
export const useAccess = () => useContext(AccessCtx)
export const can = (access, ...keys) => access.is_manager || keys.some((k) => access.perms?.includes(k))
