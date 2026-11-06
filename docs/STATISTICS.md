# ORIGIN LAB — İstatistiksel Analiz Planı (v1.3.0)

Bu belge, birincil replikasyonun istatistiksel tasarımını ve analizini
tanımlar. Birincil sonlanım, eşleştirilmiş tohum kümesi ve tam işaret-flip
testi, `n = 20` birincil veri üretilmeden önce depoda kodlanmıştır. Betimsel
özet, eşik duyarlılığı ve doz-yanıt bölümleri veri üretimi sırasında/sonrasında
eklenmiştir; bu eklemeler birincil testin yönünü, istatistiğini veya
α düzeyini değiştirmez. Plan harici bir kayıt defterine (ör. OSF) önceden
kaydedilmediği için “ön kayıtlı” değil, **önceden kodlanmış analiz planı**
olarak anılmalıdır.

## 1. Araştırma sorusu ve tahmin edilen nicelik

**Soru.** Bu modelde, küme düzeyinde seçilim eklemek, 60 saniye sonunda
çok hücreli hücre oranını (`mcFrac`) bireysel seçilime göre artırır mı?

**Tahmin edilen nicelik (estimand).** Aynı başlangıç koşulları ve aynı
rastgelelik tohumu altında, `groupSelection = 0.90` rejimi ile
`groupSelection = 0` rejimi arasındaki 60. saniye `mcFrac` farkının
popülasyon ortalaması. Bu, simülasyon içindeki bir müdahale etkisidir;
biyolojik bir nedensel etki olarak yorumlanamaz.

**Kategorik etiket birincil sonlanım değildir.** Arayüzdeki “basit çok
hücrelilik kuruldu” etiketi, `mcFrac`, `meanAdh` ve `maxCluster` için
önceden tanımlanmış eşiklerin bir bileşimidir. Birincil istatistiksel test
yalnızca sürekli `mcFrac` farkını kullanır. Etiketin eşiklere duyarlılığı
ayrıca keşifsel olarak raporlanır; bu nedenle etiketin değişmesi birincil
sonucu geçersiz kılmaz, ancak yorumu sınırlar.

## 2. Tasarım

| Öğe | Değer |
| --- | --- |
| Tasarım | Eşleştirilmiş (paired), ortak tohum kümesi |
| Tohumlar | `500000 + i × 7919`, `i = 0…19` |
| Rejim sayısı | 4 (kontrol, grup seçilimi, güçlü baskı, yüksek mutasyon) |
| Her rejimde n | 20 |
| Toplam koşu | 80 |
| Süre | 60 s simülasyon zamanı |
| Adım | `dt = 1/60 s` |
| Birincil sonlanım | 60. saniyedeki `mcFrac` |
| Birincil karşılaştırma | Grup seçilimi − Kontrol |
| İkincil sonlanımlar | `meanAdh`, `maxCluster`, `meanCoop`, `somaFrac` |
| İkincil karşılaştırmalar | Diğer rejim çiftleri; keşifsel |

Tohumlar dört rejimde de aynıdır. Bu, başlangıç hücre konumlarını, başlangıç
gen değerlerini ve besin alanındaki rastgele yamaları eşleştirir. Rejimler
farklı ölüm/doğum olayları ürettiği için PRNG akışları kısa sürede ayrışır;
eşleştirme yalnızca başlangıç koşullarını ve ortak rastgele girdileri
eşitler. Bu nedenle tasarım, “aynı bireylerin iki rejimde izlenmesi” değil,
**ortak başlangıç koşullu bağımsız yörüngeler** olarak yorumlanmalıdır.

## 3. Hipotezler ve test

- **H0:** Eşleştirilmiş `mcFrac` farklarının dağılımı sıfır etrafında
  simetriktir (medyan fark = 0).
- **H1:** Farkların dağılımı sıfır etrafında simetrik değildir (medyan fark ≠ 0).
- **Test:** İki yönlü **tam işaret-flip permütasyon testi** (exact sign-flip
  permutation test), test istatistiği ortalama fark.
- **Anlamlılık düzeyi:** α = 0.05.
- **Permütasyon sayısı:** `2^20 = 1.048.576` (tam numaralandırma).
- **p-değeri:** Gözlenen |ortalama fark| değerine eşit veya daha büyük
  |permütasyon ortalaması| üreten işaret atamalarının oranı.

İşaret-flip testi, sıfır hipotezi altında her eşleştirilmiş farkın işaretinin
bağımsız ve eşit olasılıkla değişebildiği varsayımına dayanır. Bu varsayım,
farkların sıfır etrafında simetrik dağıldığı durumda sağlanır. Fark
dağılımının çarpıklığı bu varsayımı zayıflatabilir; bu nedenle medyan fark,
bootstrap güven aralığı ve üstünlük olasılığı da raporlanır.

## 4. Etki büyüklüğü ve belirsizlik

- **Medyan eşleştirilmiş fark:** Birincil nokta tahmini.
- **%95 bootstrap güven aralığı:** 10.000 yeniden örnekleme, percentile
  yöntemi; sabit bootstrap tohumu `20261105`.
- **Cohen’s dz:** Ortalama fark / farkların standart sapması. Bağımsız
  gruplar için kullanılan Cohen’s d değil, eşleştirilmiş tasarıma uygun
  etki büyüklüğüdür.
- **Üstünlük olasılığı (probability of superiority):** Farkın pozitif olduğu
  tohumların oranı.

Bootstrap aralığı, medyan farkın örnekleme belirsizliğini gösterir; model
belirsizliğini, parametre belirsizliğini veya biyolojik genellenebilirliği
kapsamaz.

### Güç ve kesinlik

`n = 20` eşleştirilmiş farkla iki yönlü tam işaret-flip testinin ulaşabileceği
en küçük p-değeri `2 / 2^20 ≈ 1,91 × 10⁻⁶`’dır. Normal yaklaşım altında,
α = 0.05 ve %80 güç için yaklaşık `|dz| ≈ 0,63` gerekir. Bu, bir önsel güç
hesabı değil, tasarımın ne kadar küçük bir standardize etkiyi
yakalayabileceğine dair kaba bir referanstır. Gözlenen etki büyüklüğü ve
%95 güven aralığı, asıl kesinlik göstergesi olarak raporlanır. `n = 20`
küçük bir örneklemdir; bu nedenle istatistiksel anlamlılık tek başına
biyolojik önem olarak yorumlanmaz.

## 5. Çokluk ve keşifsel analizler

Yalnızca **bir** birincil test vardır; bu nedenle birincil α için çokluk
düzeltmesi yapılmaz. Diğer rejimler, diğer metrikler ve doz-yanıt analizi
**keşifseldir**. Keşifsel karşılaştırmalarda α düzeltmesi uygulanmaz; bunun
yerine etki büyüklükleri, güven aralıkları ve ham p-değerleri açıkça
“keşifsel” etiketiyle raporlanır. Keşifsel bir p < 0.05 sonucu doğrulayıcı
kanıt sayılmaz.

## 6. Eksik veri ve dışlama

Önceden tanımlanmış dışlama yoktur. Tüm tohumlar ve tüm koşular analize
girer. Bir koşu sayısal olarak geçersiz (NaN/Infinity) veya popülasyon
tükenmiş (`pop < 30`) olsaydı bu durum raporlanacak ve birincil analizden
çıkarılmayacak, duyarlılık analizinde ayrıca gösterilecekti. Birincil
veri setinde böyle bir koşu yoktur.

## 7. Doğrulayıcı olmayan duyarlılık analizleri

- **Eşik duyarlılığı:** “Kuruldu” sınıflandırması taban, sıkı ve gevşek
  eşiklerle yeniden hesaplanır.
- **Doz-yanıt:** `groupSelection ∈ {0, 0.25, 0.50, 0.75, 1.00}`, ilk 8
  eşleştirilmiş tohum, 60 s. Bu analiz keşifseldir ve yalnızca
  `groupSelection` değiştirilir.
- **Sayısal duyarlılık:** `dt = 1/60`, `1/120` ve `1/240` karşılaştırması.
  Ortak rastgele sayılar kullanılmadığı için bu bir yakınsama kanıtı değil,
  kaba bir sağlamlık kontrolüdür.
- **Tarayıcı doğrulaması:** WebGL2 bağlamı, konsol hataları, rapor/CSV,
  masaüstü ve mobil düzen.

## 8. Yorumlama sınırları

- Sonuç, **bu modelde ve bu parametre aralığında** geçerlidir.
- Grup seçilimi dışarıdan dayatılır; doğada nasıl ortaya çıktığı modellenmez.
- 60 s ≈ 3 ortalama nesildir; uzun vadeli evrim değildir.
- Bağlar yalnızca aynı soy içinde kurulur; bedavacılık bastırılmıştır.
- Soma farklılaşması zayıf bir grup yararına sahiptir; karmaşık işbölümü
  gerçek anlamda test edilmez.
- İstatistiksel anlamlılık, biyolojik önem veya ampirik doğrulama değildir.

## 9. Yeniden üretim

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

Ham veri: `data/replicates_paired.csv`. Analiz özeti:
`data/paired_summary.json`. Doz-yanıt özeti:
`data/sweep_summary.json`.
