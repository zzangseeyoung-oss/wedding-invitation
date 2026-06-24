# Mobile Wedding Invitation

장시영 · 이근영 모바일 청첩장 정적 사이트입니다.

## GitHub Pages 배포

1. GitHub에서 새 빈 저장소를 만듭니다.
2. 이 폴더에서 원격 저장소를 연결합니다.
3. `main` 브랜치를 push합니다.
4. GitHub 저장소의 `Settings > Pages`에서 `Deploy from a branch`, `main`, `/root`를 선택합니다.

```powershell
git remote add origin https://github.com/USER/REPO.git
git branch -M main
git push -u origin main
```

## QR 코드

GitHub Pages 주소가 나온 뒤 `mobile-url.txt`를 만들고 최종 URL을 넣습니다.

```powershell
Copy-Item mobile-url.example.txt mobile-url.txt
notepad mobile-url.txt
python generate_qr.py
```

그 다음 상위 폴더의 `make_redesign_invitation.py`를 다시 실행하면 종이 청첩장 PDF에 QR이 들어갑니다.
