# 방명록 Firebase 설정 및 운영 기록

축하 글(이름·비밀번호·사진·페이지네이션)을 실제로 저장하려면 Firebase 프로젝트 1개가 필요합니다.
**신용카드/결제 등록 없이 무료(Spark 플랜)** 로 됩니다. (사진은 Storage 대신 Firestore에 압축 저장)

> **설정 완료 (2026-07-16)**
> - 프로젝트: `wedding-sygy-20261010`
> - Firestore: `(default)`, `asia-northeast3`(서울), Spark 무료 티어
> - 웹 앱: `Wedding Invitation Web`
> - SDK 설정: `firebase-config.js` 반영 완료
> - 보안 규칙: `firestore.rules` 배포 완료

아래 내용은 재설정과 운영 점검을 위한 기록입니다. 규칙의 기준 파일은 `firestore.rules`입니다.

---

## 1. 프로젝트 만들기
1. https://console.firebase.google.com 접속 → 구글 로그인
2. **프로젝트 추가** → 이름 예: `wedding-invitation` → 계속
3. Google 애널리틱스는 **사용 안 함**으로 두고 생성 (있어도 무방)

## 2. Firestore 데이터베이스 만들기
1. 왼쪽 메뉴 **빌드 > Firestore Database** → **데이터베이스 만들기**
2. 위치: **asia-northeast3 (서울)** 권장
3. 시작 모드: **프로덕션 모드**로 시작 (규칙은 3단계에서 넣습니다)

## 3. 보안 규칙 붙여넣기
Firestore Database 화면 상단 **규칙(Rules)** 탭 → 아래 내용으로 **전체 교체** 후 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /guestbook/{docId} {
      allow read: if true;

      allow create: if
        request.resource.data.keys().hasOnly(['name', 'message', 'pw', 'salt', 'image', 'createdAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1
        && request.resource.data.name.size() <= 20
        && request.resource.data.message is string
        && request.resource.data.message.size() <= 500
        && request.resource.data.pw is string
        && request.resource.data.pw.size() == 64
        && request.resource.data.salt is string
        && request.resource.data.salt.size() == 32
        && (
             request.resource.data.image == null
             || (
                  request.resource.data.image is string
                  && request.resource.data.image.size() <= 1000000
                  && request.resource.data.image.matches('^data:image/jpeg;base64,.*')
                )
           )
        && (
             request.resource.data.message.size() > 0
             || request.resource.data.image != null
           )
        && request.resource.data.createdAt == request.time;

      allow update: if false;
      allow delete: if true;
    }
  }
}
```

> 규칙 설명: 누구나 읽기 가능(방명록이므로), 글 작성은 형식·길이 검증을 통과할 때만 허용,
> 수정 불가. **삭제는 앱에서 비밀번호로 본인 확인 후 처리**합니다.
> (정적 사이트라 서버가 없어 삭제 규칙 자체는 열려 있습니다. 즉 개발 지식이 있는 사람은
> 규칙만으로는 남의 글을 지울 수도 있습니다 — 청첩장 방명록 수준에서는 일반적인 방식이며,
> 더 강한 보안이 필요하면 나중에 App Check 또는 Cloud Functions로 보강할 수 있습니다.)

## 4. 웹 앱 등록 + config 복사
1. 왼쪽 위 **⚙️(프로젝트 설정)** → **일반** 탭
2. 아래로 스크롤 → **내 앱** → **웹(</>)** 아이콘 클릭
3. 앱 닉네임 예: `wedding-web` → **앱 등록** (Firebase Hosting 체크는 안 함)
4. 표시되는 `firebaseConfig = { ... }` 값을 복사

복사한 값은 이런 모양입니다(예시):

```js
const firebaseConfig = {
  apiKey: "AIzaSyD....",
  authDomain: "wedding-invitation-xxxx.firebaseapp.com",
  projectId: "wedding-invitation-xxxx",
  storageBucket: "wedding-invitation-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
};
```

## 5. config 적용
- 실제 웹 앱 설정은 `firebase-config.js`에 적용되어 있습니다.
- 웹 앱을 다시 만들거나 프로젝트를 교체할 때만 해당 파일의 값을 갱신합니다.

> config 값은 **비밀키가 아닙니다.** 웹에 공개되는 embed용이며, 실제 보안은 위 3단계 규칙이 담당합니다.
> 그대로 GitHub에 커밋해도 안전합니다.

---

## 무료 한도(참고 · Spark 플랜)
- Firestore 저장 1 GiB, 읽기 5만/일, 쓰기 2만/일, 네트워크 10 GiB/월
- 사진 1장 ≈ 0.4~0.7 MB(자동 압축) → 수천 장까지 여유. 결혼식 규모에서는 **사실상 비용 0원**.
