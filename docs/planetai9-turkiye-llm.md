# PlanetAI9 — Türkiye LLM (uygulama notu)

Bu not, **PlanetAI9** tarafında yapılacak “Türkiye LLM” ürününün kapsamını, sayfa yapısını, veri kaynağını (LLM Radar) ve fazları özetler. Detaylı model kataloğu, teknik sinyal ve skor **LLM Radar**’da kalır; PlanetAI9 **vitrin + üretici sayfaları + public etkileşim + overview** katmanıdır.

---

## 1. Amaç

Türkiye’de üretilen / Türkçe odaklı LLM ve ilgili modelleri:

- görünür kılmak (kaç model, kimler üretmiş, yıllara/tekniklere göre dağılım),
- üreticileri (kurum / kişi) tanıtmak,
- ziyaretçilerin üreticilere **public soru / yorum** bırakabilmesini sağlamak,
- modelin derin detayına gidince kullanıcıyı **LLM Radar**’a (veya HF linkine) yönlendirmek.

**Tek cümle:** Radar veri üretir; PlanetAI9 gösterir, anlatır ve konuşturur.

---

## 2. Sorumluluk ayrımı

| Konu | PlanetAI9 | LLM Radar |
|---|---|---|
| Overview (istatistik, grafik, harita, haber) | Evet | Veri API |
| Üretici listesi / üretici detay sayfası | Evet | `company` + modeller API |
| Public yorum / soru-cevap | Evet (PlanetAI DB) | Yok (veya sadece forward) |
| Model teknik tablo, yıl kartları, filtreler | İsteğe bağlı özet | Ana deneyim |
| Model detay / benchmark / HF | Link ile Radar veya HF | Kaynak |
| Haber / gelişme kartları (TR LLM) | Overview’da listeler | Events / news kaynağı |

Model için ikinci bir “master DB” PlanetAI’da tutulmaz. Model kimliği Radar’dan (veya HF `org/name`) gelir.

---

## 3. Bilinen Radar durumu (bugün)

Türkçe modeller Radar’da toplanıyor ve sınıflandırılıyor:

- Kaynak: Hugging Face (Türkçe org’lar + arama + pin’ler), first-commit ile düzeltilmiş yayın yılı.
- En eski HF Hub tarihi pratikte **2020-02 (BERTurk)**; Hub’da 2020 öncesi Türkçe model yok.
- Sınıflar: yıl, teknik (Base / Fine-tuned / Embedding / Encoder / …), geliştirici.
- Liste API: `GET /api/v1/models/turkish?limit=500` (tavan 1000).
- Eksik / yapılacak Radar tarafı (PlanetAI’ya temiz besleme için):
  - response’a `company_slug`, `website_url` eklemek,
  - `GET /api/v1/developers/{slug}` (profil + modeller),
  - (opsiyonel) `origin=turkish` events filtresi veya dedicated news endpoint.

PlanetAI geliştirmeye Radar API’leri netleşmeden mock/fixture ile başlanabilir; prod’da Radar’a bağlanır.

---

## 4. PlanetAI9 bilgi mimarisi

### 4.1 Overview (`/turkiye-llm` veya `/turkiye-llm/overview`)

Tek sayfada (scroll) önerilen bloklar, yukarıdan aşağı:

1. **Hero**  
   - Başlık: Türkiye LLM  
   - Kısa lead: yerel modeller, üreticiler, açık ağırlık  
   - CTA: Üreticilere git / Radar’da tüm modeller

2. **KPI şeridi**  
   - Toplam model  
   - Open-weight sayısı  
   - Üretici (unique company) sayısı  
   - (opsiyonel) Son 30 günde eklenen

3. **Dağılım grafikleri**  
   - **Tekniğe göre** (bar veya donut): Embedding, Fine-tuned, Base, Encoder, Quantized, …  
   - **Yıllara göre** (bar / area): 2020 → güncel (Radar `published_at`)  
   - İleride: open vs gated, license kırılımı

4. **En çok model üretenler**  
   - Top 8–12 üretici kartı: isim, logo/favicon, model sayısı  
   - Tık → üretici detay sayfası

5. **Harita (Türkiye)**  
   - Kurum/kişinin curated `city` / `lat,lng` bilgisi olanlar pin  
   - Konumu bilinmeyenler haritada yok; listede durur  
   - Pin tık → üretici sayfası  
   - Not: HF’de konum yok; PlanetAI curated tablo şart

6. **Haberler / gelişmeler**  
   - Son N Türkiye LLM haberi (Radar events, TR filtresi)  
   - Kart: başlık, tarih, kaynak, 1–2 cümle  
   - Tık → orijinal kaynak veya Radar gelişmeler sayfası  
   - “Tümünü gör” → Radar events veya PlanetAI haber arşivi (v2)

7. **Footer CTA**  
   - Radar’da tam katalog  
   - Geri bildirim / üretici olmak istiyorum formu (opsiyonel)

### 4.2 Üreticiler listesi (`/turkiye-llm/ureticiler`)

- Arama + sıralama (model sayısı / ada göre)
- Kart: isim, tür (Kurum | Kişi), model sayısı, web, HF
- Tık → detay

### 4.3 Üretici detay (`/turkiye-llm/ureticiler/[slug]`)

- İsim, tür, logo, kısa bio (curated)
- Web sitesi, Hugging Face org/kullanıcı
- **Geliştirdiği modeller** listesi (Radar’dan), her satırda:
  - model adı
  - teknik, yıl, downloads (özet)
  - link: **LLM Radar model / katalog** (ve/veya HF)
- **Sorular & yorumlar** (public)
  - Yeni yorum formu
  - Onaylı thread listesi (tarih, yazar, metin)
  - Yanıt (v1’de tek seviye yeterli; thread nested v2)

### 4.4 Model detayı

PlanetAI’da ağır model detay sayfası **yapılmaz**.  
Kart/liste satırından:

- öncelik: `https://llmradar.planetai9.com/...` (Radar’da ilgili model veya Türkçe LLM bölümü),
- ikincil: Hugging Face repo URL.

---

## 5. Veri modeli (PlanetAI9)

### 5.1 Radar’dan gelen (cache’lenebilir)

```text
TurkishModel {
  id, name, organization, company_slug?,
  technique?, published_at?, downloads?,
  source_url?, website_url?, datasets?[]
}
```

Overview aggregations client veya BFF’te:

- `count by technique`
- `count by year`
- `count by company_slug` → top producers

### 5.2 PlanetAI curated: `developers`

```text
DeveloperProfile {
  slug            // Radar company_slug ile aynı olmalı
  display_name
  kind            // "org" | "person"
  bio             // kısa markdown/plain
  logo_url?
  website_url?
  hf_url?         // https://huggingface.co/{org}
  city?
  country         // default "TR"
  lat?, lng?      // harita
  published       // boolean
  updated_at
}
```

İlk doldurma: Radar’daki en çok modele sahip org’lar + elle bio/konum.

### 5.3 PlanetAI: `developer_comments` (public Q&A)

```text
DeveloperComment {
  id
  developer_slug
  author_name
  author_email?     // public gösterme; moderasyon / reply için
  body
  status            // pending | approved | rejected
  created_at
  ip_hash?          // rate limit / abuse
}
```

**Öneri (v1):** public görünüm = yalnızca `approved`. Form gönderince `pending`; admin onayından sonra yayın.  
Alternatif: anında public + sonradan silme (daha riskli).

---

## 6. API sözleşmesi (Radar → PlanetAI)

PlanetAI’nın ihtiyacı (Radar’da tamamlanacak / BFF):

1. `GET /api/v1/models/turkish?limit=500`  
   - Alanlar: mevcut + **`company_slug`**, **`website_url`**
2. `GET /api/v1/developers/{slug}`  
   - `{ profile: { slug, name, website_url }, models: TurkishModel[], stats: { count } }`
3. `GET /api/v1/developers?origin=turkish` (opsiyonel)  
   - Üretici listesi + model count
4. Haberler:  
   - mevcut events API + `origin=turkish` / keyword filtresi  
   - veya `GET /api/v1/news?topic=turkish-llm&limit=10`

CORS / public read: PlanetAI domain’inden Radar API’ye izin.

Cache: Overview için 5–15 dk CDN/BFF cache yeterli.

---

## 7. UI / UX notları (PlanetAI)

- PlanetAI marka dili (kendi tipografi/renk) kullanılır; Radar’ın cream/lime shell’i kopyalanmak zorunda değil.
- Overview tek scroll; “dashboard çöplüğü” olmasın: her blok bir iş.
- Üretici kartlarında gerçek logo yoksa favicon / initials.
- Haber kartları taze görünmeli (tarih + kaynak net).
- Mobil: KPI 2×2, grafikler full-width, harita basitleştirilmiş, yorum formu sticky değil.

---

## 8. Moderasyon & güvenlik (yorumlar)

- Rate limit (IP + slug başına)
- Max uzunluk, link spam filtresi
- `pending` kuyruğu + basit admin UI (PlanetAI içi)
- Kişisel veri: e-posta public değil; KVKK metni form altında kısa
- İleride: üreticiye “yeni soru” e-posta bildirimi (opt-in)

---

## 9. Faz planı

### Faz 0 — Anlaşma
- Route prefix: örn. `planetai9.com/turkiye-llm`
- Yorum: onaylı mı / anında public mi
- Harita v1’de var mı

### Faz 1 — Radar API hazırlığı (Radar ekibi)
- `company_slug` + `website_url` turkish payload
- `GET /developers/{slug}`
- Events TR filtresi (haberler için)

### Faz 2 — PlanetAI Overview
- KPI + teknik/yıl grafikleri
- Top üreticiler
- Haberler bandı
- Radar’a CTA

### Faz 3 — Üreticiler
- Liste + detay
- Curated bio / konum
- Model listesi → Radar/HF link
- Harita (Faz 2’ye de alınabilir)

### Faz 4 — Public Q&A
- Form + approved list
- Admin moderasyon
- (Opsiyonel) e-posta notify

### Faz 5 — Cilâ
- SEO (üretici sayfaları index)
- OG image
- Analytics event’leri (üretici tık, yorum gönder, Radar’a çıkış)

---

## 10. Overview wireframe (metin)

```text
[ Hero: Türkiye LLM ]
[ KPI | KPI | KPI | KPI ]

[ Teknik dağılımı grafik ]  [ Yıllara göre grafik ]

[ En çok üretenler — kart grid ]

[ Türkiye haritası — pin’ler ]

[ Son haberler — 3–6 kart ]
[ Radar’da tüm modeller → ]
```

---

## 11. Başarı ölçütleri

- Overview’da güncel model / üretici sayısı Radar ile uyumlu (± cache)
- Üretici sayfasından Radar/HF tıklanma
- Onaylı yorum adedi / spam oranı
- Haber kartlarının tıklanma oranı

---

## 12. Açık sorular (PlanetAI karar)

1. Path: `/turkiye-llm` mi, ayrı subdomain mi?
2. Yorumlar: **onaylı yayın** (önerilen) mi?
3. Harita ilk release’te mi?
4. Haberler sadece Radar events mi, yoksa PlanetAI editöryel “öne çıkan” mı da eklenecek?
5. Dil: TR-only mi, TR/EN?

---

## 13. Tek cümlelik özet (yönetim için)

**PlanetAI9 Türkiye LLM = yerel ekosistem vitrini (istatistik, grafik, harita, haber, üretici sayfaları, public sorular); model gerçeği ve derin katalog LLM Radar’da.**
