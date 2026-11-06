# ORIGIN LAB — ODD Protokolü (v1.3.0)

Bu belge, birey tabanlı modeli **ODD protokolü** (Overview, Design concepts,
Details) biçiminde tanımlar. Amaç, modelin okunabilir, eleştirilebilir ve
tekrarlanabilir olmasını sağlamaktır. ODD yapısı için bkz. Grimm et al. (2020),
*The ODD protocol for describing agent-based and other simulation models: A
second update*, JASSS 23(2):7, doi:10.18564/jasss.4259.

Model sürümü: **1.3.0**. Nominal entegrasyon adımı: `dt = 1/60 s`.

---

## 1. Overview

### 1.1 Purpose

Model, tek hücreli bir popülasyonda **basit çok hücreliliğin** (hücrelerin
kalıcı, bağlı kümeler halinde bulunması) bireysel seçilim altında neden
korunamadığını ve küme düzeyinde seçilim eklendiğinde nasıl korunabildiğini
test eder. Model, çok hücreliliğin kökenine dair ampirik bir kanıt değil;
seçilim düzeyine ilişkin mekanizma hipotezinin biçimsel bir gösterimidir.

### 1.2 Entities, state variables and scales

**Dünya.** 1800 × 1125 birimlik 2B toroidal alan. En fazla 6.000 canlı hücre.
Uzamsal besin alanı 180 × 112 hücreye ayrılmıştır (10 × 10 birimlik hücreler).

**Hücreler.** Her hücrenin durum değişkenleri:

| Değişken | Anlam | Aralık / birim |
| --- | --- | --- |
| `x`, `y` | Konum | 0–1800, 0–1125 |
| `vx`, `vy` | Hız | birim/s |
| `energy` | Enerji | 0–20 |
| `age` | Yaş | s |
| `radius` | Yarıçap | 2.8–5.4 |
| `generation` | Soy nesli | tamsayı |
| `clade` | Soy kimliği | 0–5 başlangıçta |
| `gAdh` | Yapışma geni | 0–1 |
| `gCoop` | İşbirliği geni | 0–1 |
| `gSoma` | Somatik kader geni | 0–1 |
| `somaState` | Somatik hücre mi? | 0/1 |
| `clusterId` | Bağlı bileşen kimliği | hücre indeksi |
| `parent`, `rank` | Union-find yardımcıları | — |
| `bondCount` | Bağ sayısı | 0–7 |

**Kümeler.** Bağlı bileşenler union-find ile her adımda yeniden hesaplanır.
“Çok hücreli” sayılma eşiği ≥ 8 hücredir.

**Zaman.** Sabit adım `dt = 1/60 s`. 60 s ≈ 3 ortalama nesil; maksimum soy
8–11 nesil. Bu, uzun vadeli evrimsel zaman değildir.

### 1.3 Process overview and scheduling

Her adımda sırasıyla:

1. Besin alanı güncellenir (lojistik yenilenme + difüzyon).
2. Hücre başına işbirliği enerji bütçesi hesaplanır.
3. Kümeler sıfırlanır; komşuluk hash’i kurulur.
4. Hücre çiftleri için bağ oluşumu, kuvvet ve enerji paylaşımı uygulanır.
5. Kümeler sonlandırılır (union-find).
6. Metabolizma, yaşlanma, ölüm ve soma farklılaşması uygulanır.
7. Hareket entegrasyonu yapılır.
8. Üreme ve mutasyon uygulanır.
9. Her 5 s’de bir grup seçilimi darbesi uygulanır.
10. Metrikler ve değerlendirme güncellenir.

Canlı arayüzde bu adımlar kare başına birden çok kez çalıştırılır; başsız
(`runHeadless`) koşularda adım sayısı `ceil(süre / dt)` ile belirlenir.

---

## 2. Design concepts

- **Emergence:** Küme yapısı, hücre–hücre bağları ve enerji paylaşımından
  kendiliğinden ortaya çıkar; küme kimliği dışarıdan atanmaz.
- **Adaptation:** Hücrelerin enerji toplama ve bölünme başarısı, genotipleri
  üzerinden dolaylı seçilim uygular.
- **Fitness:** Modelde fitness, enerji ve bölünme başarısının vekilidir;
  gerçek uygunluk değildir. Grup fitness’ı dışarıdan uygulanan darbe ile
  tanımlanır.
- **Prediction:** Hücreler ileriye dönük tahmin yapmaz; kararlar yerel
  kurallarla verilir.
- **Sensing:** Hücreler yalnızca yerel besin, temas ve bağlı komşularını
  “algılar”; küresel bilgi yoktur.
- **Interaction:** Temas/bağ kuvvetleri, enerji paylaşımı ve grup darbesi.
- **Stochasticity:** Başlangıç konumları, gen değerleri, mutasyonlar, ölüm ve
  bölünme olayları deterministik PRNG ile üretilir.
- **Collectives:** Bağlı bileşenler (kümeler) kolektif varlıklardır; grup
  seçilimi bu kolektiflere uygulanır.
- **Observation:** Popülasyon, çok hücreli oran, küme boyutu dağılımı, gen
  ortalamaları, soma oranı ve nesil sayısı kaydedilir.

---

## 3. Details

### 3.1 Initialization

- 320 hücre, 6 soy (`clade = i mod 6`).
- Konumlar dünya üzerinde düzgün rastgele.
- `gAdh ~ N(0.30, 0.10)`, `gCoop ~ N(0.30, 0.10)`,
  `gSoma ~ N(0.16, 0.07)`, hepsi [0, 1] aralığına kırpılır.
- Başlangıç enerjisi 0.9; yaş 0; yarıçap `3.2 + U(0, 1.2)`.
- Besin alanı: ortalama 0.78, `U(−0.12, +0.12)` gürültü ve 18 zengin yama.
- Başlangıçta bağ yoktur; `mcFrac = 0`, `maxCluster = 1`.

### 3.2 Input data

Dış veri yoktur. Tüm girdiler model parametreleridir:

| Parametre | Varsayılan | Anlam |
| --- | ---: | --- |
| `mutationRate` | 0.05 | Gen başına, bölünme başına mutasyon olasılığı |
| `groupSelection` | 0.90 | Seçilim darbesinin gücü |
| `nutrientSupply` | 1.00 | Besin yenilenme çarpanı |
| `adhesionCost` | 0.15 | Yapışma geni başına enerji maliyeti |
| `cooperationCost` | 0.02 | İşbirliği geni başına enerji maliyeti |
| `seed` | 20261103 | PRNG tohumu |

### 3.3 Submodels

#### 3.3.1 Besin alanı

Her grid hücresi `n ∈ [0,1]`:

\[
n_{t+dt} = n_t + r\,n_t(1-n_t)\,dt,
\qquad r = 0.08 \times \text{nutrientSupply}.
\]

Difüzyon, 5 noktalı toroidal Laplacian ile:

\[
n_{t+dt} = n_t + k\,(\bar{n} - n_t),
\qquad k = \min(0.24,\; 3.6\,dt).
\]

`k = 0.06` nominal `dt = 1/60` değerine karşılık gelir; `dt` ile ölçeklenir.
Hücre alımı bilineer örnekleme ile `take(x, y, 0.50, dt)`; alınan miktar
komşu grid hücrelerinden oransal düşülür.

#### 3.3.2 Hareket ve kuvvetler

Hız sönümü nominal adımda 0.90’dır. Genel adımda sönümleme ve yenilik
varyansı birlikte ölçeklenir:

\[
v_{t+dt} = v_t \cdot 0.90^{\,dt/dt_0} + U(-a,a),
\qquad
a = 13\,dt_0 \sqrt{\frac{1-0.90^{\,2dt/dt_0}}{1-0.81}},
\]

burada \(dt_0 = 1/60\) s. Nominal adımda \(a = 13/60\) olur ve ifade
orijinal güncellemeye birebir indirgenir.

Konum: `x_{t+dt} = wrap(x_t + v_x dt)`. Temas eden hücreler arasında:

- Bağ kuvveti: `36 * strength * (d - 1.02*(r_i+r_j))`
- Itme: `-110 * ((r_i+r_j) - d)` (örtüşme varsa)

Kuvvetler `dt` ile impuls olarak hıza eklenir.

#### 3.3.3 Bağ oluşumu

İki hücre bağ kurar eğer:

1. `d ≤ 1.42 (r_i + r_j)`,
2. `min(gAdh_i, gAdh_j) > 0.25`,
3. `clade_i = clade_j`,
4. her hücrenin bağ sayısı `min(7, 2 + round(4 gAdh))` altında.

Bağlar yalnızca aynı soy içinde kurulur; bu, bedavacılığı olduğundan az
temsil eder ve modelin önemli bir sınırıdır.

#### 3.3.4 Enerji paylaşımı

Bağlı ve aynı soydan hücreler arasında, donörün bütçesi kadar:

\[
\text{budget}_i = gCoop_i \cdot 0.07 \cdot dt \cdot \min(1, E_i).
\]

Enerji farkı varsa transfer:

\[
\Delta E = \min(\text{budget}_i,\; 0.08(E_i-E_j)),
\]

alıcıya `0.86 ΔE` geçer; `0.14 ΔE` kayıptır.

#### 3.3.5 Metabolizma ve ölüm

\[
E_{t+dt} = \min\left(20,\; E_t + \text{uptake} -
(0.035 + 0.15 gAdh + 0.02 gCoop + 0.004 b + 0.015 \cdot soma)\,dt\right)
\]

burada `b` bağ sayısıdır. Ölüm:

- `E ≤ 0.20` → ölüm,
- `age > 35` ve `U(0,1) < 0.04 dt` → olasılıksal ölüm,
- `age > 75` → deterministik ölüm.

Ölen hücre bulunduğu grid hücresine 0.28 besin bırakır.

#### 3.3.6 Üreme ve mutasyon

Koşullar: `E ≥ 1.55`, `age ≥ 1.2`, soma değil. Üreme olasılığı:

\[
p = 1 - \exp\left[-1.15(0.25 + \min(6, E-1.55))\,dt\right].
\]

Popülasyon 6.000’e ulaştıysa, en düşük enerjili başka bir hücre öldürülür ve
öldürülen hücrenin yuvası aynı adımda yeni yavruya aktarılır (`v1.3.0`
düzeltmesi). Enerji ikiye bölünür; yavruya `0.97` çarpanı uygulanır. Her gen
bağımsız olarak `mutationRate` olasılıkla mutasyona uğrar:

\[
g' = \mathrm{clamp}(g + N(0, 0.12), 0, 1).
\]

Yavru, ebeveynin soy kimliğini ve `generation + 1` değerini alır.

#### 3.3.7 Somatik farklılaşma

Küme boyutu ≥ 10 ve `gSoma > 0.45` ise hücre soma durumuna geçer. Bu
**geri dönüşsüzdür**; soma hücresi bölünmez, etkin yapışması `+0.25`, etkin
işbirliği `0.9` olur ve ek `0.015/s` maliyet öder.

#### 3.3.8 Grup seçilimi darbesi

`groupSelection > 0.01` ise her 5 s’de bir:

- **≥ 8 hücreli kümeler:** her üyeye
  \[
  \Delta E = gs \left(0.02 + 0.08\min(1, s/50) + 0.60\,\overline{gAdh}_{eff} + 0.30\,\overline{gCoop}\right)
  \]
  eklenir (üst sınır 20).
- **< 8 hücreli kümeler:** hücre başına ölüm olasılığı
  `gs * 0.22` (tek hücre) veya `gs * 0.09` (2–7 hücre).

Bu darbe dışarıdan dayatılır ve küme boyutu, yapışma, işbirliğini doğrudan
ödüllendirir. Sonuç kısmen bu tasarımın doğal sonucudur.

#### 3.3.9 Metrikler ve değerlendirme

- `mcFrac`: ≥ 8 hücreli kümelerdeki hücrelerin popülasyona oranı.
- `meanCluster`: hücre başına ortalama küme boyutu (boyut-ağırlıklı).
- `maxCluster`: en büyük bağlı bileşen.
- `meanAdh`, `meanCoop`, `meanSoma`: popülasyon ortalamaları.
- `somaFrac`: soma hücrelerinin oranı.
- `clusters8`, `clusters20`: eşik üstü küme sayıları.
- `meanGen`, `maxGen`: ortalama ve maksimum soy nesli.

Değerlendirme eşikleri `js/config.js` içindeki `VERDICT_THRESHOLDS` ile
tanımlıdır; arayüz, rapor ve CSV aynı değerleri kullanır.

### 3.4 Numerical integration and reproducibility

- Nominal adım `dt = 1/60 s`.
- Besin difüzyonu `k = min(0.24, 3.6 dt)` ile ölçeklenir.
- Hız, ayrık bir Ornstein–Uhlenbeck süreci olarak güncellenir. Sönümleme
  `0.90^(dt/(1/60))`, yenilik varyansı ise durağan hız varyansını koruyacak
  biçimde ölçeklenir. Nominal adımda ifade orijinal `0.90` sönümleme ve
  `(U−0.5)·26·dt` yeniliğine birebir indirgenir.
- `v1.3.0` ayrıca popülasyon üst sınırında ölü hücre yuvasının yeniden
  kullanılmaması hatasını düzeltir. Bu nedenle üst sınıra ulaşan 60 s
  yörüngeleri `v1.1.0` ile birebir aynı değildir; düzeltme
  [`VALIDATION.md`](VALIDATION.md) içinde belgelenmiştir.
- `runHeadless(seconds, dt)` isteğe bağlı adım genişliği ile çalışır.
- `births`, `deaths` ve `failedSpawns` sayaçları özet, rapor ve CSV’de
  raporlanır. Popülasyon muhasebesi `pop = births − deaths + 320` ile
  denetlenir; birincil grup koşuları için ayrıca
  `scripts/audit_accounting.py` çalıştırılır.
- Rastgelelik deterministik PRNG ile üretilir; aynı tohum + aynı adım sayısı
  aynı çıktıyı verir.
- Farklı `dt` değerleri olay zamanlamasını ve RNG tüketimini değiştirdiği için
  yörüngeler birebir aynı olmak zorunda değildir; bu nedenle `dt` duyarlılığı
  ortak rastgele sayılar kullanılmadan tam bir yakınsama testi değildir.

### 3.5 Known limitations

- Grup seçilimi dışarıdan dayatılır; doğal olarak nasıl ortaya çıktığı
  modellenmez.
- Bağlar yalnızca aynı soy içinde kurulur; bedavacılık ve sosyal çatışma
  yeterince temsil edilmez.
- Soma tek eşikli ve zayıf grup yararına sahiptir; karmaşık işbölümü test
  edilmez.
- Fiziksel kuvvetler, hücre iskeleti, hücre dışı matriks ve gerçek predatörler
  yoktur.
- 60 s kısa vadeli bir penceredir; uzun vadeli evrim ve ekolojik geri
  bildirimler yoktur.
