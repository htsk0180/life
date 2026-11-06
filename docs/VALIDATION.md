# ORIGIN LAB — Doğrulama ve Tekrarlanabilirlik Raporu (v1.3.0)

Bu belge, modelin **yazılım doğrulamasını**, **sayısal sağlamlık
kontrollerini** ve **istatistiksel yeniden üretilebilirliğini** kaydeder.
Buradaki “doğrulama” (validation) terimi, modelin biyolojik gerçekliği
temsil ettiğinin ampirik kanıtı anlamına **gelmez**. Model, seçilim düzeyine
ilişkin bir mekanizma hipotezinin biçimsel gösterimidir.

## 1. Doğrulama kapsamı

| Katman | Soru | Yöntem |
| --- | --- | --- |
| Yazılım doğrulaması | Kod çalışıyor ve tutarlı mı? | Sözdizimi, HTML/CSV bütünlüğü, tarayıcı testi |
| Sayısal doğrulama | Entegrasyon adımı sonuçları değiştiriyor mu? | `dt = 1/60`, `1/120`, `1/240` karşılaştırması |
| Determinizm | Aynı tohum aynı çıktıyı veriyor mu? | İki bağımsız örnek, aynı tohum |
| İstatistiksel tekrarlanabilirlik | Analiz ham veriden yeniden üretilebilir mi? | Sabit tohumlar, sabit bootstrap tohumu, ham CSV |
| Yapısal geçerlilik | Model biyolojik sistemi temsil ediyor mu? | **Kapsam dışı**; ODD’de sınırlar belgelenmiştir |

## 2. Yazılım ve bütünlük kontrolleri

`scripts/check_project.py` şunları denetler:

- Gerekli dosyaların varlığı.
- `index.html` içinde yinelenen `id` ve kapanmayan etiket.
- Tüm `js/*.js` ve `scripts/replicate.js` dosyalarının JavaScriptCore ile
  sözdizimi kontrolü.
- README’de yer tutucu ve kırık yerel bağlantı olmaması.
- CSV dosyalarında `NaN`, `Infinity`, `undefined` bulunmaması.
- README’nin model sürümü `1.3.0`’ı içermesi.

`scripts/validate_model.py` şunları denetler:

- `MODEL_VERSION === '1.3.0'`.
- `VERDICT_THRESHOLDS` nesnesinin dondurulmuş olması.
- “Kuruldu” eşiğinin `mcFrac = 0.30` olması.
- Aynı tohumla iki bağımsız simülasyonun 5 s sonunda birebir aynı
  `pop`, `mcFrac`, `meanAdh`, `maxCluster` vermesi.
- Metriklerin sonlu olması.
- Özet şemasının `modelVersion`, `initialMetrics` ve `verdict` içermesi.
- Başlangıç popülasyonunun 320, `mcFrac = 0`, `maxCluster = 1` olması.
- Popülasyon muhasebesi: `pop` canlı hücre sayısına eşit, `births − deaths =
  pop − 320`, başarısız doğum yok, yuva muhasebesi tutarlı ve `freeList` ile
  `pendingFree` çakışmıyor.
- `dt = 1/60` ve `1/120` koşularının sonlu ve `mcFrac` farkının 0.25’ten
  küçük olması (kaba sağlamlık kontrolü; tam yakınsama testi değildir).

## 3. Determinizm

Aynı tohum ve aynı adım sayısı, aynı yörüngeyi üretir. Örnek:

| Tohum | Süre | pop | mcFrac | meanAdh | maxCluster |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 424242 | 5 s | iki bağımsız örnekte birebir aynı | aynı | aynı | aynı |

Tarayıcıdaki canlı döngü, kare hızına bağlı olarak farklı sayıda adım
çalıştırabilir; bu nedenle canlı ekran değerleri ile `runHeadless(60)`
değerleri arasında küçük farklar görülebilir. Bu bir determinizm ihlali
değil, farklı adım sayısıdır.

## 4. Sürüm değişiklikleri ve nominal sonuçlar

`v1.3.0` iki sayısal değişiklik içerir:

1. **Hız güncellemesi:** Ayrık Ornstein–Uhlenbeck sürecinin sönümlemesi ve
   yenilik varyansı `dt` ile ölçeklenir. Nominal `dt = 1/60` değerinde
   ifade orijinal `0.90` sönümleme ve `(U−0.5)·26·dt` yeniliğine birebir
   indirgenir.
2. **Popülasyon üst sınırı hatası:** `v1.1.0`/`v1.2.0`’da popülasyon
   `maxCells = 6000` iken bir doğum, en düşük enerjili hücreyi öldürüyor
   ancak ölen hücrenin yuvasını aynı adımda yeniden kullanmıyordu. Bu,
   özellikle grup seçilimi rejiminde **doğum olmadan ölüm** üretiyordu.
   `v1.3.0` ölü yuvaları `pendingFree` kuyruğundan hemen geri kazanır.

Hata düzeltmesinin etkisi, grup seçilimi tohumu `20261103` için 60 saniyelik
koşuda ölçüldü:

| Sürüm | pop | mcFrac | Başarısız doğum |
| --- | ---: | ---: | ---: |
| `v1.2.0` (hatalı) | 5.997 | 0,8182 | 1.925 |
| `v1.3.0` (düzeltilmiş) | 5.974 | 0,7295 | 0 |

Yani eski sonuçlardaki yüksek `mcFrac` kısmen, üst sınırda gerçekleşmeyen
doğumların yol açtığı ek ölümlerle şişmişti. Bu nedenle `v1.3.0` sonuçları
`v1.1.0` ile birebir aynı değildir; eski replikasyon dosyası
`data/replicates.csv` yalnızca tarihsel pilot olarak tutulur.

Güncel nominal sonuçlar:

| Rejim | Tohum | pop | mcFrac | meanAdh | maxCluster | Sonuç |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Kontrol | 4117 | 4.717 | 0,2092 | 0,2345 | 48 | `collapsed` |
| Grup seçilimi | 20261103 | 5.974 | 0,7295 | 0,3108 | 84 | `established` |

## 5. Entegrasyon adımı duyarlılığı

20 saniyelik koşularda `dt = 1/60`, `1/120` ve `1/240` karşılaştırması:

| Rejim | Tohum | 1/60 mcFrac | 1/120 mcFrac | 1/240 mcFrac |
| --- | ---: | ---: | ---: | ---: |
| Kontrol | 4117 | 0,5656 | 0,5700 | 0,5828 |
| Grup seçilimi | 20261103 | 0,5861 | 0,6104 | 0,6477 |

`dt = 1/120` için grup seçilimi farkı 2,4 puandır; bu, eski `dt` ölçeklemesindeki
6,4 puana göre iyileşmiştir. Ancak `dt = 1/240` değerinde fark 6,2 puana
çıkar. Bu bir **yakınsama kanıtı değildir**: farklı `dt` değerleri farklı
sayıda adım ve farklı PRNG tüketimi üretir; ortak rastgele sayılar (common
random numbers) kullanılmamıştır. Stokastik yörüngeler kısa sürede ayrışır.
Bu nedenle mutlak değerler değil, rejimler arası büyük farklar
yorumlanmalıdır; `dt` duyarlılığı bir sınır olarak raporlanmıştır.

Asıl 60 saniyelik sonlanım noktasında `scripts/dt60_check.py` ile yapılan
kontrol:

| Rejim | Tohum | 1/60 mcFrac | 1/120 mcFrac | 1/240 mcFrac | Δ (1/120) | Δ (1/240) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Kontrol | 4117 | 0,2092 | 0,2001 | 0,1964 | −0,0091 | −0,0128 |
| Grup seçilimi | 20261103 | 0,7295 | 0,7439 | 0,7470 | +0,0144 | +0,0175 |

60 saniyede `dt` etkisi 1–2 puan mertebesindedir; 20 saniyedeki geçici
ayrışmadan daha küçüktür. Yine de bu yalnızca iki tohum ve altı koşudur;
formal yakınsama analizi değildir ve sonuçların mutlak değerleri `dt`’ye
duyarlıdır. Rejimler arası fark (yaklaşık 52 puan) `dt` belirsizliğinden
çok daha büyüktür.

## 6. İstatistiksel yeniden üretilebilirlik

- Tohumlar: `500000 + i × 7919`, `i = 0…19`; dört rejimde ortak.
- Birincil test: iki yönlü tam işaret-flip permütasyonu, `2^20` permütasyon.
- Bootstrap: 10.000 yeniden örnekleme, sabit tohum `20261105`.
- Ham veri: `data/replicates_paired.csv`.
- Analiz özeti: `data/paired_summary.json`.
- Doz-yanıt ham verisi: `data/sweep_group_selection.csv`.
- Doz-yanıt özeti: `data/sweep_summary.json`.

Analiz betikleri yalnızca Python standart kütüphanesini kullanır; bu, sonuçların
farklı makinelerde aynı ham veriden yeniden üretilmesini kolaylaştırır.
Ayrıntılı plan: [`docs/STATISTICS.md`](STATISTICS.md).

Birincil analizde 20 eşleştirilmiş tohumun 20’sinde de grup seçilimi
kontrol’den yüksek `mcFrac` üretti; medyan fark +0,5256, %95 bootstrap GA
[+0,5112; +0,5405], iki yönlü tam işaret-flip p = 1,91 × 10⁻⁶
(`2 / 2^20`). Doz-yanıt taramasında `groupSelection` 0 → 1 arttıkça
`mcFrac` medyanı 0,187 → 0,730 arttı; tohum içi eğim 8/8 pozitifti
(keşifsel tam işaret-flip p = 0,0078). Bu sayılar, ham CSV’lerden
`scripts/analyze_paired.py` ve `scripts/analyze_sweep.py` ile yeniden
üretilebilir.

## 7. Tarayıcı ve WebGL doğrulaması

Son uçtan uca testte:

- WebGL2 bağlamı oluşturuldu; `glError = 0`.
- Konsol hatası ve yakalanmamış istisna yok.
- Dört hazır rejim 60 saniyelik koşuyla çalıştırıldı.
- Rapor modalı, metin raporu ve CSV indirme çalıştı.
- Masaüstü (1440 × 1000) ve mobil (390 × 844) düzenlerinde yatay taşma yok
  (`scrollWidth = 390`).
- Model sürümü arayüzde, raporda ve CSV’de `1.3.0` olarak göründü.

## 8. Doğrulanmayan alanlar

Aşağıdakiler bu projede **doğrulanmamıştır** ve sonuçların genellenebilirliğini
sınırlar:

- **Ampirik geçerlilik:** Model, Ratcliff ve arkadaşlarının maya deneylerinin
  nicel bir kopyası değildir; parametreler gerçek biyolojik ölçümlerle
  kalibre edilmemiştir.
- **Yapısal geçerlilik:** Hücre fiziği, hücre dışı matriks, gerçek predatörler,
  gelişim programları ve ekolojik geri bildirimler yoktur.
- **Uzun vadeli evrim:** 60 s ≈ 3 ortalama nesildir; uzun vadeli karmaşıklık
  evrimi test edilmez.
- **Grup seçiliminin kökeni:** Grup seçilimi dışarıdan dayatılır; doğada nasıl
  ortaya çıktığı modellenmez.
- **Bedavacılık:** Bağlar yalnızca aynı soy içinde kurulur; sosyal çatışma ve
  bedavacılık doğal sistemlere göre fazla bastırılmıştır.
- **Karmaşık işbölümü:** Soma farklılaşması tek eşikli ve zayıf grup yararına
  sahiptir; gerçek işbölümü test edilmez.
- **Sayısal yakınsama:** `dt` karşılaştırması kaba bir kontrol olup formal
  yakınsama analizi değildir.
- **İstatistiksel genelleme:** `n = 20` tohum, modelin kendi stokastik
  varyasyonunu örnekler; biyolojik popülasyonlara genelleme yapılamaz.

## 9. Yeniden üretim komutları

```bash
python3 scripts/headless_replication.py --n 20 --seconds 60
python3 scripts/analyze_paired.py
python3 scripts/sweep_group_selection.py
python3 scripts/analyze_sweep.py
python3 scripts/audit_accounting.py
python3 scripts/nominal_runs.py
python3 scripts/dt60_check.py
python3 scripts/validate_model.py
python3 scripts/check_project.py
```

Tarayıcı koşucusu için:

```js
const rows = await ORIGIN_REPLICATE.run();
ORIGIN_REPLICATE.download(rows);
```

`scripts/headless_replication.py` varsayılan olarak macOS’taki
JavaScriptCore’u kullanır. Farklı bir sistemde `JSC` ortam değişkeniyle uyumlu
bir motor yolu verilebilir veya tarayıcı koşucusu kullanılabilir.
