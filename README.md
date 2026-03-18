# PromptBox

Promptlarınızı kaydedin, kategorilere ayırın ve tek tıkla yapıştırın.

[Chrome Web Store'dan yükle](https://chromewebstore.google.com/detail/promptbox/epmpcmnhbljbecdalbcfpmalmkeigfmj)

## Nedir?

PromptBox, sık kullandığınız prompt'ları saklayıp hızlıca herhangi bir metin alanına yapıştırmanızı sağlayan bir Chrome uzantısıdır.

## Özellikler

- Prompt kaydetme ve düzenleme
- Kategorilere ayırma (klasör yapısı)
- Tek tıkla aktif metin alanına yapıştırma
- Template değişken desteği (`{{degisken}}`)
- Sağ tık menüsünden hızlı erişim (Context Menu)
- PDF olarak dışa aktarma
- Karanlık/Aydınlık tema desteği
- Klavye kısayolu: `Alt+P`

## Kurulum (Geliştirici Modu)

1. Bu repoyu klonlayın
2. Chrome'da `chrome://extensions` adresine gidin
3. "Geliştirici modu"nu açın
4. "Paketlenmemiş öğe yükle" ile proje klasörünü seçin

## Dosya Yapısı

```
manifest.json          # Chrome MV3 yapılandırması
background/            # Service worker (arka plan işlemleri)
popup/                 # Ana popup arayüzü (HTML/CSS/JS)
content/               # Content script (sayfa içi etkileşim)
lib/                   # Yardımcı modüller (storage, utils)
export/                # PDF dışa aktarma
icons/                 # Uzantı ikonları
```

## Lisans

MIT
