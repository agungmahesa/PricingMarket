const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dimwgnrxfwkeopjurmdn.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_0QFlOSekkwzCTh-5VYvw-g_u8safgWX';

console.log('Initializing Supabase Client:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
