export type PublicItem = {
  id: string;
  name: string;
  description: string;
  size: string;
  color: string;
  measurements: string;
  photos: string[]; // actual garment photographs
  previews: string[]; // styled previews; no badge, Gallery shows a neutral note when there are no real photos
  price: number | null;
  includedDays: number;
  extensionRate: number;
  accessories: string;
  careNotes: string;
  bookable: boolean;
  draft: boolean;
};

export type PublicSettings = {
  bookingsOpen: boolean;
  facebookPageUrl: string;
  pickupLocation: string;
  operatingHours: string;
  pickupTimeSlots: string[];
  returnDeadlineTime: string;
  rentalDays: number;
  maxOnlineDays: number;
  extensionRate: number;
  extensionBasis: '' | 'per_dress' | 'per_booking';
  cleaningBufferDays: number;
  holdHours: number;
  depositAmount: number;
  depositBasis: '' | 'per_dress' | 'per_booking';
  minLeadDays: number;
  maxAdvanceDays: number;
  maxItemsPerBooking: number;
  lateFeePerDay: number;
  rentalTerms: string;
  privacyNotice: string;
  cancellationPolicy: string;
};

export type Catalog = { items: PublicItem[]; settings: PublicSettings; preview: boolean };

export type BookingSummary = {
  code: string;
  status: string;
  confirmed: boolean;
  items: { id: string; name: string; price: number; extensionCharge: number }[];
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnDeadline: string;
  days: number;
  rentalTotal: number;
  depositRequired: number | null;
  holdExpiry: string;
  facebookPageUrl: string;
};

export type ServiceFailure = { ok: false; code: string; message: string; errors?: Record<string, string>; itemIds?: string[] };
