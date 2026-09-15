-- =========================================================================
-- 004_imagenes_contests.sql — Imagenes de los contests en Supabase Storage
--
-- El contenedor es publico SOLO para leer: las imagenes se muestran por URL
-- a agentes sin sesion. Nadie puede subir ni borrar con la clave publicable
-- (no hay politicas de escritura); eso lo hace la funcion del servidor
-- "multimedia" (supabase/funciones/multimedia) con la clave secreta,
-- despues de validar el PIN aqui.
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contests', 'contests', true, 8388608,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- La validacion del PIN recibe la direccion explicita. Cuando la pagina
-- llama directo a la base, la direccion sale de la cabecera de la peticion;
-- cuando llama la funcion del servidor, esa cabecera es la de la funcion y
-- no la del agente, asi que la funcion la pasa a mano. Sin esto, todos los
-- intentos por esa via compartirian un contador y cualquiera bloquearia al
-- administrador real.
create or replace function privado.pin_valido_desde(p_pin text, p_ip text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ip     text := coalesce(nullif(pg_catalog.btrim(p_ip), ''), 'desconocida');
  v_fallos int;
  v_pin    text;
begin
  if p_pin is null or pg_catalog.btrim(p_pin) = '' then
    return false;
  end if;

  select count(*) into v_fallos
    from privado.intentos_pin
   where ip = v_ip and momento > now() - interval '15 minutes';

  if v_fallos >= 10 then
    raise exception 'Demasiados intentos con PIN incorrecto. Espera 15 minutos.';
  end if;

  select valor into v_pin from privado.config where clave = 'adminPin';
  if v_pin is not null and pg_catalog.btrim(v_pin) = pg_catalog.btrim(p_pin) then
    return true;
  end if;

  insert into privado.intentos_pin (ip) values (v_ip);
  delete from privado.intentos_pin where momento < now() - interval '1 day';
  return false;
end $$;

create or replace function privado.pin_valido(p_pin text) returns boolean
language sql volatile security definer set search_path = '' as $$
  select privado.pin_valido_desde(p_pin, privado.ip_cliente())
$$;

-- Solo para la funcion del servidor (clave secreta). La clave publicable no
-- puede ejecutarla.
create or replace function public.validar_pin_servicio(p_pin text, p_ip text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return privado.bien(pg_catalog.to_jsonb(privado.pin_valido_desde(p_pin, p_ip)));
exception when others then
  return privado.mal(sqlerrm);
end $$;

revoke all on function privado.pin_valido_desde(text, text) from public, anon, authenticated;
revoke all on function public.validar_pin_servicio(text, text) from public, anon, authenticated;
grant execute on function public.validar_pin_servicio(text, text) to service_role;
