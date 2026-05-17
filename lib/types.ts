export type Country = {
  id: string;
  name: string;
  code: string;
  emoji?: string;
};

export type City = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

export type Profile = {
  id: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  country_code?: string;
  city_id?: string;
};

export type CityMessage = {
  id: string;
  city_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at?: string;
};
