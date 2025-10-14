// Cliente de Supabase para el frontend
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// Cargar config desde env.js
const supabase = createClient(
  window.PP_ENV.sb_url,
  window.PP_ENV.sb_anon
);

// ========== AUTH HELPERS ==========

// Registrar nuevo usuario
async function signUp(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata, // datos extra como role, name, etc.
    }
  });
  
  if (error) throw error;
  return data;
}

// Iniciar sesión
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  return data;
}

// Cerrar sesión
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Obtener usuario actual
async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

// Obtener perfil completo del usuario
async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}

// Actualizar perfil
async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ========== EXPORTS ==========
window.supabaseClient = {
  supabase,
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getProfile,
  updateProfile
};